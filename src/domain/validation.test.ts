import { describe, expect, it } from 'vitest'
import { CONFIG_SCHEMA_VERSION } from './types'
import { validateExportBundle, validateStoredConfig } from './validation'

const validRule = {
  id: 'one',
  dnrRuleId: 1,
  name: '百度',
  enabled: true,
  priority: 9,
  target: {
    schemes: ['https'],
    host: 'www.baidu.com',
    includeSubdomains: false,
    path: '/*',
  },
  mode: 'password',
  challenges: [{ id: 'step', answer: '明文答案' }],
  accessDurationMinutes: 30,
}

describe('配置校验', () => {
  it('规范化优先级并保留明文答案', () => {
    const result = validateStoredConfig({ schemaVersion: CONFIG_SCHEMA_VERSION, rules: [validRule] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rules[0]?.priority).toBe(0)
    expect(result.value.rules[0]?.challenges[0]?.answer).toBe('明文答案')
  })

  it('拒绝没有答案的口令规则', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{ ...validRule, challenges: [{ ...validRule.challenges[0], answer: '' }] }],
    })
    expect(result.ok).toBe(false)
  })

  it('拒绝不支持的导出版本', () => {
    const result = validateExportBundle({ schemaVersion: 99, exportedAt: '', rules: [] })
    expect(result).toEqual({ ok: false, errors: ['不支持的导出文件版本'] })
  })

  it('拒绝 v1 存储配置', () => {
    const result = validateStoredConfig({
      schemaVersion: 1,
      rules: [{ ...validRule, theme: 'aurora' }],
    })
    expect(result).toEqual({ ok: false, errors: ['不支持的配置版本'] })
  })

  it('拒绝 v1 导出文件', () => {
    const result = validateExportBundle({
      schemaVersion: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      rules: [{ ...validRule, theme: 'cockpit' }],
    })
    expect(result).toEqual({ ok: false, errors: ['不支持的导出文件版本'] })
  })
})
