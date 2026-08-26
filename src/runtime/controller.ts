import { activateAccess, evaluateRule, isAnswerCorrect, settleRuntime } from '../domain/policy'
import {
  CONFIG_SCHEMA_VERSION,
  type AccessRule,
  type ChallengeStep,
  type RuntimeStore,
  type StoredConfig,
} from '../domain/types'
import { findMatchingRule, urlPatternToDnrRegex } from '../domain/url-pattern'
import { validateStoredConfig } from '../domain/validation'
import { replaceDynamicRules } from './dnr'
import type {
  ConfigMutationResponse,
  GateAdvanceResponse,
  GateContext,
  RuleStatus,
  RuntimeRequest,
} from './messages'
import { toPublicGateStep, toPublicRule } from './messages'
import {
  clearChallengeProgress,
  clearPendingNavigation,
  clearRuleChallengeProgress,
  getChallengeProgress,
  getPendingNavigation,
  loadConfig,
  loadRuntimeStore,
  saveConfig,
  saveRuntimeStore,
  setChallengeProgress,
  setPendingNavigation,
  stateForRule,
} from './storage'

const POLICY_ALARM = 'pilot-guardian-policy-boundary'
const POLICY_WATCHDOG = 'pilot-guardian-policy-watchdog'
let syncQueue: Promise<void> = Promise.resolve()
let configMutationQueue: Promise<void> = Promise.resolve()

function challengeSequenceSignature(rule: AccessRule): string {
  return JSON.stringify(rule.challenges)
}

function runtimeChanged(left: object, right: object): boolean {
  return JSON.stringify(left) !== JSON.stringify(right)
}

async function normalizeRuntime(
  config: StoredConfig,
  store: RuntimeStore,
  now: number,
): Promise<RuntimeStore> {
  const nextByRuleId: RuntimeStore['byRuleId'] = {}
  for (const rule of config.rules) {
    const settled = settleRuntime(rule, stateForRule(store, rule.id), now)
    if (Object.keys(settled).length > 0) nextByRuleId[rule.id] = settled
  }
  const next = { schemaVersion: CONFIG_SCHEMA_VERSION, byRuleId: nextByRuleId } as const
  if (runtimeChanged(store, next)) await saveRuntimeStore(next)
  return next
}

async function scheduleNextBoundary(
  config: StoredConfig,
  runtime: RuntimeStore,
  now: number,
): Promise<void> {
  let earliest: number | undefined
  for (const rule of config.rules) {
    if (!rule.enabled) continue
    const boundary = evaluateRule(rule, stateForRule(runtime, rule.id), now).nextChangeAt
    if (boundary && (!earliest || boundary < earliest)) earliest = boundary
  }
  await chrome.alarms.clear(POLICY_ALARM)
  if (earliest) {
    chrome.alarms.create(POLICY_ALARM, { when: Math.max(earliest, now + 1_000) })
  }
}

async function synchronizePolicies(): Promise<void> {
  const now = Date.now()
  const [config, rawRuntime] = await Promise.all([loadConfig(), loadRuntimeStore()])
  const runtime = await normalizeRuntime(config, rawRuntime, now)
  await Promise.all([
    replaceDynamicRules(config, runtime, now),
    scheduleNextBoundary(config, runtime, now),
  ])
}

export function requestPolicySync(): Promise<void> {
  syncQueue = syncQueue
    .catch((error: unknown) => console.error('Previous policy sync failed', error))
    .then(synchronizePolicies)
  return syncQueue
}

function enqueueConfigMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = configMutationQueue.then(mutation, mutation)
  configMutationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function saveActivatedRule(
  rule: AccessRule,
  runtimeStore: RuntimeStore,
  now: number,
): Promise<void> {
  runtimeStore.byRuleId[rule.id] = activateAccess(
    rule,
    stateForRule(runtimeStore, rule.id),
    now,
  )
  await saveRuntimeStore(runtimeStore)
  await requestPolicySync()
}

export async function handleNavigation(tabId: number, url: string): Promise<boolean> {
  const [config, runtime] = await Promise.all([loadConfig(), loadRuntimeStore()])
  const rule = findMatchingRule(config.rules, url)
  if (!rule) return false

  const now = Date.now()
  const evaluation = evaluateRule(rule, stateForRule(runtime, rule.id), now)
  if (
    rule.mode === 'schedule' &&
    (evaluation.reason === 'interval-ready' || evaluation.reason === 'calendar-open')
  ) {
    await saveActivatedRule(rule, runtime, now)
    return false
  }
  if (evaluation.state === 'allowed') return false

  await setPendingNavigation(tabId, { ruleId: rule.id, url, capturedAt: now })
  return true
}

async function gateContext(ruleId: string, tabId: number): Promise<GateContext> {
  const now = Date.now()
  const [config, runtime, pending] = await Promise.all([
    loadConfig(),
    loadRuntimeStore(),
    getPendingNavigation(tabId),
  ])
  const rule = config.rules.find((candidate) => candidate.id === ruleId && candidate.enabled)
  if (!rule) {
    if (pending?.ruleId === ruleId) await clearPendingNavigation(tabId)
    throw new Error('访问规则不存在或已停用')
  }
  if (pending?.ruleId !== ruleId) throw new Error('当前标签页没有对应的受控导航')

  let evaluation = evaluateRule(rule, stateForRule(runtime, rule.id), now)
  if (
    rule.mode === 'schedule' &&
    (evaluation.reason === 'interval-ready' || evaluation.reason === 'calendar-open')
  ) {
    await saveActivatedRule(rule, runtime, now)
    evaluation = evaluateRule(rule, stateForRule(runtime, rule.id), now)
  }
  const progress = await getChallengeProgress(tabId, ruleId, challengeSequenceSignature(rule))
  const stepIndex = Math.min(progress.stepIndex, Math.max(0, rule.challenges.length - 1))
  const step = rule.challenges[stepIndex]
  const context: GateContext = {
    rule: { id: rule.id, name: rule.name },
    evaluation,
    stepIndex,
    totalSteps: rule.challenges.length,
    ...(step ? { step: toPublicGateStep(step) } : {}),
    sessionId: progress.sessionId,
    now,
    originalUrl: pending.url,
  }
  if (evaluation.state === 'allowed') {
    await Promise.all([
      clearPendingNavigation(tabId),
      clearChallengeProgress(tabId, rule.id),
    ])
  }
  return context
}

interface ChallengeCompletionRequest {
  ruleId: string
  stepId: string
  stepIndex: number
  sessionId: string
}

async function completeChallenge(
  request: ChallengeCompletionRequest,
  tabId: number,
  expectedType: ChallengeStep['type'],
  answer?: string,
): Promise<GateAdvanceResponse> {
  const [config, runtime] = await Promise.all([loadConfig(), loadRuntimeStore()])
  const rule = config.rules.find((candidate) => candidate.id === request.ruleId && candidate.enabled)
  if (!rule) return { ok: false, error: '访问规则不存在或已停用' }
  const pending = await getPendingNavigation(tabId)
  if (pending?.ruleId !== rule.id) return { ok: false, error: '当前标签页没有对应的受控导航' }

  const now = Date.now()
  if (evaluateRule(rule, stateForRule(runtime, rule.id), now).state !== 'challenge') {
    return { ok: true, complete: true, redirectUrl: pending.url }
  }

  const signature = challengeSequenceSignature(rule)
  const progress = await getChallengeProgress(tabId, rule.id, signature)
  if (request.stepIndex !== progress.stepIndex || request.sessionId !== progress.sessionId) {
    return { ok: false, error: '挑战会话已变化，请刷新后重试' }
  }
  const challenge = rule.challenges[progress.stepIndex]
  if (!challenge || challenge.id !== request.stepId || challenge.type !== expectedType) {
    return { ok: false, error: '挑战步骤不匹配' }
  }
  if (challenge.type === 'text' && (answer === undefined || !isAnswerCorrect(challenge.answer, answer))) {
    return { ok: false, error: '口令不正确' }
  }

  const nextStepIndex = progress.stepIndex + 1
  if (nextStepIndex < rule.challenges.length) {
    await setChallengeProgress(tabId, rule.id, nextStepIndex, signature)
    return { ok: true, complete: false, nextStepIndex }
  }

  await saveActivatedRule(rule, runtime, now)
  await Promise.all([
    clearChallengeProgress(tabId, rule.id),
    clearPendingNavigation(tabId),
  ])
  return { ok: true, complete: true, redirectUrl: pending.url }
}

async function validateDnrPatterns(patterns: string[]): Promise<string[]> {
  const uniquePatterns = [...new Set(patterns)]
  const results = await Promise.all(uniquePatterns.map(async (pattern) => {
    const result = await chrome.declarativeNetRequest.isRegexSupported({
      regex: urlPatternToDnrRegex(pattern),
      isCaseSensitive: true,
    })
    return result.isSupported
      ? undefined
      : `URL 模式无法用于浏览器拦截：${pattern}${result.reason ? `（${result.reason}）` : ''}`
  }))
  return results.filter((error): error is string => Boolean(error))
}

async function commitRules(
  input: unknown,
  preflightRuleIds: 'all' | string[] = [],
  resetRuleIds: string[] = [],
): Promise<ConfigMutationResponse> {
  const parsed = validateStoredConfig({ schemaVersion: CONFIG_SCHEMA_VERSION, rules: input })
  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  const preflightIds = new Set(preflightRuleIds === 'all'
    ? parsed.value.rules.map((rule) => rule.id)
    : preflightRuleIds)
  const dnrErrors = await validateDnrPatterns(parsed.value.rules
    .filter((rule) => preflightIds.has(rule.id))
    .flatMap((rule) => rule.urlPatterns))
  if (dnrErrors.length > 0) return { ok: false, errors: dnrErrors }

  const [previous, runtime] = await Promise.all([loadConfig(), loadRuntimeStore()])
  const now = Date.now()
  const previousById = new Map(previous.rules.map((rule) => [rule.id, rule]))
  const changedRuleIds = new Set<string>()
  const forcedResetIds = new Set(resetRuleIds)
  const nextRuntime: RuntimeStore = { schemaVersion: CONFIG_SCHEMA_VERSION, byRuleId: {} }
  for (const rule of parsed.value.rules) {
    const oldRule = previousById.get(rule.id)
    const oldRuntime = stateForRule(runtime, rule.id)
    const forcedReset = oldRule && forcedResetIds.has(rule.id)
    const behaviorChanged = oldRule && JSON.stringify({
      urlPatterns: oldRule.urlPatterns,
      mode: oldRule.mode,
      challenges: oldRule.challenges,
      schedule: oldRule.schedule,
      accessDurationMinutes: oldRule.accessDurationMinutes,
    }) !== JSON.stringify({
      urlPatterns: rule.urlPatterns,
      mode: rule.mode,
      challenges: rule.challenges,
      schedule: rule.schedule,
      accessDurationMinutes: rule.accessDurationMinutes,
    })
    if (oldRule && (forcedReset || behaviorChanged)) {
      changedRuleIds.add(rule.id)
      if (!forcedReset) {
        const preserved = { ...settleRuntime(oldRule, oldRuntime, now) }
        if (preserved.activeUntil && oldRule.schedule?.kind === 'interval') {
          preserved.lastWindowEndedAt = now
        }
        delete preserved.activeUntil
        delete preserved.verifiedCalendarKey
        if (Object.keys(preserved).length > 0) nextRuntime.byRuleId[rule.id] = preserved
      }
    } else if (Object.keys(oldRuntime).length > 0) {
      nextRuntime.byRuleId[rule.id] = oldRuntime
    }
  }

  for (const oldRule of previous.rules) {
    if (!parsed.value.rules.some((rule) => rule.id === oldRule.id)) changedRuleIds.add(oldRule.id)
  }

  await Promise.all([
    saveConfig(parsed.value),
    saveRuntimeStore(nextRuntime),
    ...[...changedRuleIds].map(clearRuleChallengeProgress),
  ])
  await requestPolicySync()
  return { ok: true, config: parsed.value }
}

function inputRuleId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined
  const id = (input as { id?: unknown }).id
  return typeof id === 'string' && id ? id : undefined
}

async function saveRule(
  input: unknown,
  insertBeforeRuleId?: string,
): Promise<ConfigMutationResponse> {
  const ruleId = inputRuleId(input)
  if (!ruleId) return { ok: false, errors: ['当前规则缺少有效 ID'] }

  const config = await loadConfig()
  const existingIndex = config.rules.findIndex((rule) => rule.id === ruleId)
  const rules = [...config.rules]
  if (existingIndex >= 0) {
    rules[existingIndex] = input as AccessRule
  } else {
    const insertIndex = insertBeforeRuleId
      ? rules.findIndex((rule) => rule.id === insertBeforeRuleId)
      : -1
    rules.splice(insertIndex >= 0 ? insertIndex : rules.length, 0, input as AccessRule)
  }
  return commitRules(rules, [ruleId], [ruleId])
}

async function deleteRule(ruleId: string): Promise<ConfigMutationResponse> {
  const config = await loadConfig()
  return commitRules(config.rules.filter((rule) => rule.id !== ruleId))
}

async function reorderRules(input: unknown): Promise<ConfigMutationResponse> {
  if (!Array.isArray(input) || input.some((id) => typeof id !== 'string')) {
    return { ok: false, errors: ['规则顺序无效'] }
  }
  const ruleIds = input as string[]
  const config = await loadConfig()
  if (
    new Set(ruleIds).size !== ruleIds.length ||
    ruleIds.length !== config.rules.length ||
    ruleIds.some((id) => !config.rules.some((rule) => rule.id === id))
  ) {
    return { ok: false, errors: ['规则列表已发生变化，请刷新后重试排序'] }
  }
  const byId = new Map(config.rules.map((rule) => [rule.id, rule]))
  return commitRules(ruleIds.flatMap((id) => {
    const rule = byId.get(id)
    return rule ? [rule] : []
  }))
}

async function getStatus(url: string, ruleId?: string): Promise<RuleStatus> {
  const now = Date.now()
  const [config, runtime] = await Promise.all([loadConfig(), loadRuntimeStore()])
  const rule = ruleId
    ? config.rules.find((candidate) => candidate.id === ruleId && candidate.enabled)
    : findMatchingRule(config.rules, url)
  if (!rule) return { now }
  return {
    rule: toPublicRule(rule),
    evaluation: evaluateRule(rule, stateForRule(runtime, rule.id), now),
    runtime: stateForRule(runtime, rule.id),
    now,
  }
}

export async function handleRuntimeMessage(
  request: RuntimeRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (request.type === 'config:get') {
    assertExtensionPage(sender, 'options.html')
    return loadConfig()
  }
  if (
    request.type === 'config:save-rule' ||
    request.type === 'config:delete-rule' ||
    request.type === 'config:reorder-rules' ||
    request.type === 'config:replace'
  ) {
    assertExtensionPage(sender, 'options.html')
    return enqueueConfigMutation(() => {
      if (request.type === 'config:save-rule') {
        return saveRule(request.rule, request.insertBeforeRuleId)
      }
      if (request.type === 'config:delete-rule') return deleteRule(request.ruleId)
      if (request.type === 'config:reorder-rules') return reorderRules(request.ruleIds)
      return commitRules(request.rules, 'all')
    })
  }
  if (request.type === 'status:get') {
    assertExtensionPage(sender, 'popup.html')
    return getStatus(request.url, request.ruleId)
  }

  const tabId = sender.tab?.id
  if (tabId === undefined) throw new Error('无法识别当前标签页')

  if (request.type === 'gate:get-context') {
    assertGatePage(sender, request.ruleId)
    return gateContext(request.ruleId, tabId)
  }
  if (request.type === 'gate:submit-text') {
    assertGatePage(sender, request.ruleId)
    return completeChallenge(request, tabId, 'text', request.answer)
  }
  if (request.type === 'gate:complete-interactive') {
    assertGatePage(sender, request.ruleId)
    return completeChallenge(request, tabId, 'interactive')
  }
  if (request.type === 'navigation:spa') {
    assertWebPage(sender, request.url)
    const blocked = await handleNavigation(tabId, request.url)
    if (blocked) {
      const config = await loadConfig()
      const rule = findMatchingRule(config.rules, request.url)
      if (rule) {
        await chrome.tabs.update(tabId, {
          url: `${chrome.runtime.getURL('/gate.html')}?ruleId=${encodeURIComponent(rule.id)}`,
        })
      }
    }
    return { blocked }
  }
  return undefined
}

function senderUrl(sender: chrome.runtime.MessageSender): URL {
  const raw = sender.url ?? sender.tab?.url
  if (!raw) throw new Error('无法识别消息来源')
  return new URL(raw)
}

function assertExtensionPage(sender: chrome.runtime.MessageSender, page: string): void {
  const actual = senderUrl(sender)
  const expected = new URL(chrome.runtime.getURL(`/${page}`))
  if (sender.id !== chrome.runtime.id || actual.origin !== expected.origin || actual.pathname !== expected.pathname) {
    throw new Error('消息来源没有执行此操作的权限')
  }
}

function assertGatePage(sender: chrome.runtime.MessageSender, ruleId: string): void {
  assertExtensionPage(sender, 'gate.html')
  if (senderUrl(sender).searchParams.get('ruleId') !== ruleId) {
    throw new Error('闸门规则与消息不匹配')
  }
}

function assertWebPage(sender: chrome.runtime.MessageSender, requestedUrl: string): void {
  const source = senderUrl(sender)
  const requested = new URL(requestedUrl)
  if (sender.id !== chrome.runtime.id || !/^https?:$/.test(source.protocol) || !/^https?:$/.test(requested.protocol)) {
    throw new Error('页面导航消息来源无效')
  }
}

export function registerController(): void {
  chrome.runtime.onInstalled.addListener(() => void requestPolicySync())
  chrome.runtime.onStartup.addListener(() => void requestPolicySync())
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLICY_ALARM || alarm.name === POLICY_WATCHDOG) {
      void requestPolicySync()
    }
  })
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0 || !/^https?:/.test(details.url)) return
    void handleNavigation(details.tabId, details.url)
  })
  chrome.runtime.onMessage.addListener((request: RuntimeRequest, sender, sendResponse) => {
    void handleRuntimeMessage(request, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error('Runtime request failed', error)
        sendResponse({
          __pilotGuardianError: error instanceof Error ? error.message : '未知错误',
        })
      })
    return true
  })
  chrome.alarms.create(POLICY_WATCHDOG, { periodInMinutes: 1 })
  void requestPolicySync()
}
