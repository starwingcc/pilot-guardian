import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AccessRule, RuntimeStore, StoredConfig } from '../domain/types'
import { CONFIG_SCHEMA_VERSION } from '../domain/types'
import { buildDynamicRules } from './dnr'

beforeAll(() => {
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      RuleActionType: { ALLOW: 'allow', REDIRECT: 'redirect' },
      ResourceType: { MAIN_FRAME: 'main_frame' },
    },
  })
})

function accessRule(id: string, dnrRuleId: number, priority: number): AccessRule {
  return {
    id,
    dnrRuleId,
    name: id,
    enabled: true,
    priority,
    target: { schemes: ['https'], host: 'example.com', includeSubdomains: false, path: '/*' },
    mode: 'password',
    challenges: [{ id: 'step', answer: 'answer' }],
    accessDurationMinutes: 30,
  }
}

describe('DNR 编译', () => {
  it('为阻塞规则生成 redirect，为已放行规则生成更高优先级 allow', () => {
    const config: StoredConfig = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [accessRule('top', 10, 0), accessRule('low', 11, 1)],
    }
    const runtime: RuntimeStore = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      byRuleId: { top: { activeUntil: 100_000 } },
    }
    const rules = buildDynamicRules(config, runtime, 1_000, 'chrome-extension://id/gate.html')
    expect(rules[0]?.action.type).toBe('allow')
    expect(rules[0]?.priority).toBeGreaterThan(rules[1]?.priority ?? 0)
    expect(rules[1]?.action).toMatchObject({
      type: 'redirect',
      redirect: { url: 'chrome-extension://id/gate.html?ruleId=low' },
    })
  })
})
