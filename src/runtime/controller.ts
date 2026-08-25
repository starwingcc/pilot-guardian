import { activateAccess, evaluateRule, isAnswerCorrect, settleRuntime } from '../domain/policy'
import {
  CONFIG_SCHEMA_VERSION,
  type AccessRule,
  type ChallengeStep,
  type RuntimeStore,
  type StoredConfig,
} from '../domain/types'
import { findMatchingRule } from '../domain/url-pattern'
import { validateStoredConfig } from '../domain/validation'
import { replaceDynamicRules } from './dnr'
import type { GateAdvanceResponse, GateContext, RuleStatus, RuntimeRequest } from './messages'
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
  if (evaluation.reason === 'interval-ready' && rule.mode === 'schedule') {
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
  if (!rule) throw new Error('访问规则不存在或已停用')
  if (pending?.ruleId !== ruleId) throw new Error('当前标签页没有对应的受控导航')

  let evaluation = evaluateRule(rule, stateForRule(runtime, rule.id), now)
  if (evaluation.reason === 'interval-ready' && rule.mode === 'schedule') {
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

async function saveRules(input: unknown): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const parsed = validateStoredConfig({ schemaVersion: CONFIG_SCHEMA_VERSION, rules: input })
  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  const [previous, runtime] = await Promise.all([loadConfig(), loadRuntimeStore()])
  const now = Date.now()
  const previousById = new Map(previous.rules.map((rule) => [rule.id, rule]))
  const changedRuleIds = new Set<string>()
  const nextRuntime: RuntimeStore = { schemaVersion: CONFIG_SCHEMA_VERSION, byRuleId: {} }
  for (const rule of parsed.value.rules) {
    const oldRule = previousById.get(rule.id)
    const oldRuntime = stateForRule(runtime, rule.id)
    const behaviorChanged = oldRule && JSON.stringify({
      target: oldRule.target,
      mode: oldRule.mode,
      challenges: oldRule.challenges,
      schedule: oldRule.schedule,
      accessDurationMinutes: oldRule.accessDurationMinutes,
    }) !== JSON.stringify({
      target: rule.target,
      mode: rule.mode,
      challenges: rule.challenges,
      schedule: rule.schedule,
      accessDurationMinutes: rule.accessDurationMinutes,
    })
    if (oldRule && behaviorChanged) {
      changedRuleIds.add(rule.id)
      const preserved = { ...settleRuntime(oldRule, oldRuntime, now) }
      if (preserved.activeUntil && oldRule.schedule?.kind === 'interval') {
        preserved.lastWindowEndedAt = now
      }
      delete preserved.activeUntil
      delete preserved.verifiedCalendarKey
      if (Object.keys(preserved).length > 0) nextRuntime.byRuleId[rule.id] = preserved
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
  return { ok: true }
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
  if (request.type === 'config:get' || request.type === 'config:save') {
    assertExtensionPage(sender, 'options.html')
    return request.type === 'config:get' ? loadConfig() : saveRules(request.rules)
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
