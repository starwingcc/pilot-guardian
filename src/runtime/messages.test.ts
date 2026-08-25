import { describe, expect, it } from 'vitest'
import type { AccessRule } from '../domain/types'
import { toPublicGateStep, toPublicRule } from './messages'

const rule: AccessRule = {
  id: 'rule',
  dnrRuleId: 1,
  name: '测试规则',
  enabled: true,
  priority: 0,
  target: { schemes: ['https'], host: 'example.com', includeSubdomains: false, path: '/*' },
  mode: 'password',
  challenges: [{ id: 'text', type: 'text', answer: '不会泄露', scene: { kind: 'default' } }],
  accessDurationMinutes: 30,
}

describe('运行时公开模型', () => {
  it('状态接口不公开文本答案', () => {
    expect(toPublicRule(rule).challenges).toEqual([{ id: 'text', type: 'text' }])
  })

  it('闸门只得到当前文本步骤的场景，不得到答案', () => {
    expect(toPublicGateStep(rule.challenges[0]!)).toEqual({
      id: 'text',
      type: 'text',
      scene: { kind: 'default' },
    })
  })
})
