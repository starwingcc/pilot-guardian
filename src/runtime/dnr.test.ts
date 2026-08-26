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

function accessRule(id: string, priority: number, urlPatterns = ['https://example.com/*']): AccessRule {
  return {
    id,
    name: id,
    enabled: true,
    priority,
    urlPatterns,
    mode: 'password',
    challenges: [{ id: 'step', type: 'text', answer: 'answer', scene: { kind: 'default' } }],
    accessDurationMinutes: 30,
  }
}

describe('DNR 编译', () => {
  it('每条 URL 生成一条规则，并保持所属访问规则的动作与优先级', () => {
    const config: StoredConfig = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        accessRule('top', 0, ['https://example.com/*', 'https://linux.do/*']),
        accessRule('low', 1),
      ],
    }
    const runtime: RuntimeStore = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      byRuleId: { top: { activeUntil: 100_000 } },
    }
    const rules = buildDynamicRules(config, runtime, 1_000, 'chrome-extension://id/gate.html')
    expect(rules).toHaveLength(3)
    expect(rules.map((rule) => rule.id)).toEqual([1, 2, 3])
    expect(rules[0]?.action.type).toBe('allow')
    expect(rules[1]?.action.type).toBe('allow')
    expect(rules[0]?.priority).toBeGreaterThan(rules[2]?.priority ?? 0)
    expect(rules[0]?.condition.isUrlFilterCaseSensitive).toBe(true)
    expect(rules[2]?.action).toMatchObject({
      type: 'redirect',
      redirect: { url: 'chrome-extension://id/gate.html?ruleId=low' },
    })
  })
})
