import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateRule } from '../domain/policy'
import type { AccessRule, RuntimeStore, StoredConfig } from '../domain/types'
import { CONFIG_SCHEMA_VERSION } from '../domain/types'
import { handleNavigation, handleRuntimeMessage } from './controller'
import type { ConfigMutationResponse, GateContext } from './messages'

const CONFIG_KEY = 'pilotGuardianConfig'
const RUNTIME_KEY = 'pilotGuardianRuntime'
const PENDING_KEY = 'pilotGuardianPending'
const PROGRESS_KEY = 'pilotGuardianProgress'
const localStore: Record<string, unknown> = {}
const sessionStore: Record<string, unknown> = {}
const isRegexSupported = vi.fn<() => Promise<{ isSupported: boolean; reason?: string }>>()
const queryTabs = vi.fn<() => Promise<chrome.tabs.Tab[]>>()
const reloadTab = vi.fn<() => Promise<void>>()

function accessRule(
  id: string,
  priority: number,
  urlPatterns = [`https://${id}.example.com/*`],
): AccessRule {
  return {
    id,
    name: id,
    enabled: true,
    priority,
    urlPatterns,
    mode: 'password',
    challenges: [{ id: `${id}-step`, type: 'text', answer: 'answer', scene: { kind: 'default' } }],
    accessDurationMinutes: 30,
  }
}

function storedRules(): AccessRule[] {
  return (localStore[CONFIG_KEY] as StoredConfig).rules
}

const sender: chrome.runtime.MessageSender = {
  id: 'extension-id',
  url: 'chrome-extension://extension-id/options.html',
}

describe('单规则配置变更', () => {
  beforeEach(() => {
    for (const key of Object.keys(localStore)) delete localStore[key]
    for (const key of Object.keys(sessionStore)) delete sessionStore[key]
    isRegexSupported.mockReset()
    isRegexSupported.mockResolvedValue({ isSupported: true })
    queryTabs.mockReset()
    queryTabs.mockResolvedValue([])
    reloadTab.mockReset()
    reloadTab.mockResolvedValue(undefined)

    const createStorageArea = (store: Record<string, unknown>) => ({
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(store, values)
      }),
    })
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        getURL: (path: string) => `chrome-extension://extension-id/${path.replace(/^\//, '')}`,
      },
      storage: {
        local: createStorageArea(localStore),
        session: createStorageArea(sessionStore),
      },
      declarativeNetRequest: {
        RuleActionType: { ALLOW: 'allow', REDIRECT: 'redirect' },
        ResourceType: { MAIN_FRAME: 'main_frame' },
        isRegexSupported,
        getDynamicRules: vi.fn(async () => []),
        updateDynamicRules: vi.fn(async () => undefined),
      },
      alarms: {
        clear: vi.fn(async () => true),
        create: vi.fn(),
      },
      tabs: {
        query: queryTabs,
        reload: reloadTab,
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('保存当前规则时保留其他已保存规则', async () => {
    const first = accessRule('first', 0)
    const second = accessRule('second', 1)
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [first, second],
    } satisfies StoredConfig

    const response = (await handleRuntimeMessage(
      {
        type: 'config:save-rule',
        rule: { ...first, name: '已修改' },
      },
      sender,
    )) as ConfigMutationResponse

    expect(response.ok).toBe(true)
    expect(storedRules().map((rule) => [rule.id, rule.name])).toEqual([
      ['first', '已修改'],
      ['second', 'second'],
    ])
  })

  it('浏览器不支持生成的正则时不写入配置', async () => {
    const first = accessRule('first', 0)
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [first],
    } satisfies StoredConfig
    isRegexSupported.mockResolvedValue({
      isSupported: false,
      reason: 'memoryLimitExceeded',
    })

    const response = (await handleRuntimeMessage(
      {
        type: 'config:save-rule',
        rule: { ...first, urlPatterns: ['https://changed.example.com/*'] },
      },
      sender,
    )) as ConfigMutationResponse

    expect(response.ok).toBe(false)
    expect(storedRules()[0]?.urlPatterns).toEqual(first.urlPatterns)
  })

  it('排序与删除立即更新已保存配置', async () => {
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [accessRule('first', 0), accessRule('second', 1)],
    } satisfies StoredConfig

    const reordered = (await handleRuntimeMessage(
      {
        type: 'config:reorder-rules',
        ruleIds: ['second', 'first'],
      },
      sender,
    )) as ConfigMutationResponse
    expect(reordered.ok).toBe(true)
    expect(storedRules().map((rule) => [rule.id, rule.priority])).toEqual([
      ['second', 0],
      ['first', 1],
    ])

    const removed = (await handleRuntimeMessage(
      {
        type: 'config:delete-rule',
        ruleId: 'first',
      },
      sender,
    )) as ConfigMutationResponse
    expect(removed.ok).toBe(true)
    expect(storedRules().map((rule) => rule.id)).toEqual(['second'])
  })

  it('即使内容未变，每次保存也只重置当前规则的运行状态与挑战进度', async () => {
    const first = accessRule('first', 0)
    const second = accessRule('second', 1)
    const activeUntil = Date.now() + 60_000
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [first, second],
    } satisfies StoredConfig
    localStore[RUNTIME_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      byRuleId: {
        first: { activeUntil },
        second: { activeUntil },
      },
    } satisfies RuntimeStore
    sessionStore[PROGRESS_KEY] = {
      '1:first': { stepIndex: 0, sequenceSignature: 'first', sessionId: 'first-session' },
      '1:second': { stepIndex: 0, sequenceSignature: 'second', sessionId: 'second-session' },
    }

    const response = (await handleRuntimeMessage(
      {
        type: 'config:save-rule',
        rule: first,
      },
      sender,
    )) as ConfigMutationResponse

    expect(response.ok).toBe(true)
    const runtime = localStore[RUNTIME_KEY] as RuntimeStore
    expect(runtime.byRuleId.first).toBeUndefined()
    expect(runtime.byRuleId.second).toEqual({ activeUntil })
    expect(sessionStore[PROGRESS_KEY]).toEqual({
      '1:second': { stepIndex: 0, sequenceSignature: 'second', sessionId: 'second-session' },
    })
  })

  it('从每周开放切换到间隔策略后立即开放，并在放行窗口结束后冷却', async () => {
    const now = Date.now()
    const weeklyRule: AccessRule = {
      ...accessRule('first', 0),
      mode: 'schedule',
      schedule: { kind: 'weekly', weekdays: [new Date(now).getDay()] },
    }
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [weeklyRule],
    } satisfies StoredConfig
    expect(evaluateRule(weeklyRule, {}, now).state).toBe('allowed')

    const response = (await handleRuntimeMessage(
      {
        type: 'config:save-rule',
        rule: {
          ...weeklyRule,
          schedule: { kind: 'interval', intervalDays: 3 },
        },
      },
      sender,
    )) as ConfigMutationResponse

    expect(response.ok).toBe(true)
    const savedRule = storedRules()[0]
    const runtime = localStore[RUNTIME_KEY] as RuntimeStore
    expect(savedRule).toBeDefined()
    if (!savedRule) return
    expect(runtime.byRuleId.first).toBeUndefined()
    expect(evaluateRule(savedRule, runtime.byRuleId.first ?? {}, Date.now())).toMatchObject({
      state: 'allowed',
      reason: 'interval-ready',
    })

    expect(await handleNavigation(1, 'https://first.example.com/page')).toBe(false)
    const activatedRuntime = localStore[RUNTIME_KEY] as RuntimeStore
    const activeUntil = activatedRuntime.byRuleId.first?.activeUntil
    expect(activeUntil).toBeTypeOf('number')
    if (!activeUntil) return
    expect(
      evaluateRule(savedRule, activatedRuntime.byRuleId.first ?? {}, activeUntil - 1).state,
    ).toBe('allowed')
    expect(
      evaluateRule(savedRule, activatedRuntime.byRuleId.first ?? {}, activeUntil + 1),
    ).toMatchObject({
      state: 'waiting',
      reason: 'cooldown',
    })
  })

  it('每周开放日首次导航时开启指定时长的放行窗口', async () => {
    const now = Date.now()
    const weeklyRule: AccessRule = {
      ...accessRule('first', 0),
      mode: 'schedule',
      schedule: { kind: 'weekly', weekdays: [new Date(now).getDay()] },
    }
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [weeklyRule],
    } satisfies StoredConfig

    expect(await handleNavigation(1, 'https://first.example.com/page')).toBe(false)
    const runtime = localStore[RUNTIME_KEY] as RuntimeStore
    expect(runtime.byRuleId.first?.activeUntil).toBeGreaterThan(now)
    expect(runtime.byRuleId.first?.verifiedCalendarKey).toBeDefined()
  })

  it('修改间隔天数后清除旧冷却并恢复首次开放状态', async () => {
    const intervalRule: AccessRule = {
      ...accessRule('first', 0),
      mode: 'schedule',
      schedule: { kind: 'interval', intervalDays: 3 },
    }
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [intervalRule],
    } satisfies StoredConfig
    localStore[RUNTIME_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      byRuleId: { first: { lastWindowEndedAt: Date.now() } },
    } satisfies RuntimeStore
    expect(
      evaluateRule(
        intervalRule,
        (localStore[RUNTIME_KEY] as RuntimeStore).byRuleId.first ?? {},
        Date.now(),
      ).state,
    ).toBe('waiting')

    const response = (await handleRuntimeMessage(
      {
        type: 'config:save-rule',
        rule: {
          ...intervalRule,
          schedule: { kind: 'interval', intervalDays: 1 },
        },
      },
      sender,
    )) as ConfigMutationResponse

    expect(response.ok).toBe(true)
    const runtime = localStore[RUNTIME_KEY] as RuntimeStore
    const savedRule = storedRules()[0]
    expect(runtime.byRuleId.first).toBeUndefined()
    expect(savedRule).toBeDefined()
    if (!savedRule) return
    expect(evaluateRule(savedRule, {}, Date.now())).toMatchObject({
      state: 'allowed',
      reason: 'interval-ready',
    })
  })

  it('保存后不刷新闸门，并在重新获取上下文时清理待处理导航', async () => {
    const weeklyRule: AccessRule = {
      ...accessRule('first', 0),
      mode: 'schedule',
      schedule: { kind: 'weekly', weekdays: [0] },
    }
    localStore[CONFIG_KEY] = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [weeklyRule],
    } satisfies StoredConfig
    sessionStore[PENDING_KEY] = {
      '1': {
        capturedAt: Date.now(),
        ruleId: weeklyRule.id,
        url: 'https://first.example.com/page',
      },
    }
    const gateUrl = 'chrome-extension://extension-id/gate.html?ruleId=first'

    const saved = (await handleRuntimeMessage(
      {
        type: 'config:save-rule',
        rule: {
          ...weeklyRule,
          schedule: { kind: 'interval', intervalDays: 3 },
        },
      },
      sender,
    )) as ConfigMutationResponse

    expect(saved.ok).toBe(true)
    expect(queryTabs).not.toHaveBeenCalled()
    expect(reloadTab).not.toHaveBeenCalled()

    const context = (await handleRuntimeMessage(
      { type: 'gate:get-context', ruleId: weeklyRule.id },
      {
        id: 'extension-id',
        url: gateUrl,
        tab: { id: 1, url: gateUrl },
      } as chrome.runtime.MessageSender,
    )) as GateContext
    expect(context.evaluation.state).toBe('allowed')
    expect(sessionStore[PENDING_KEY]).toEqual({})
  })
})
