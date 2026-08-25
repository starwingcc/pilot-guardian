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
  challenges: [{ id: 'step', type: 'text', answer: '明文答案', scene: { kind: 'default' } }],
  accessDurationMinutes: 30,
}

describe('配置校验', () => {
  it('规范化优先级并保留明文答案', () => {
    const result = validateStoredConfig({ schemaVersion: CONFIG_SCHEMA_VERSION, rules: [validRule] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rules[0]?.priority).toBe(0)
    const challenge = result.value.rules[0]?.challenges[0]
    expect(challenge?.type).toBe('text')
    if (challenge?.type === 'text') expect(challenge.answer).toBe('明文答案')
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

  it('拒绝不兼容的存储配置', () => {
    const result = validateStoredConfig({
      schemaVersion: 2,
      rules: [validRule],
    })
    expect(result).toEqual({ ok: false, errors: ['不支持的配置版本'] })
  })

  it('拒绝不兼容的导出文件', () => {
    const result = validateExportBundle({
      schemaVersion: 2,
      exportedAt: '2025-01-01T00:00:00.000Z',
      rules: [validRule],
    })
    expect(result).toEqual({ ok: false, errors: ['不支持的导出文件版本'] })
  })

  it('接受从官方模板载入并审核过的自定义交互文档', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{
        ...validRule,
        challenges: [{
          id: 'interactive',
          type: 'interactive',
          source: {
            kind: 'custom',
            document: {
              html: `<!doctype html><script type="application/json" id="pg-params">{"minimumDelay":1500,"maximumDelay":4000,"successWindow":600}</script><button>响应</button>`,
              reviewState: 'ready',
            },
          },
        }],
      }],
    })
    expect(result.ok).toBe(true)
  })

  it('拒绝旧版官方模板引用(kind: template)', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{
        ...validRule,
        challenges: [{
          id: 'interactive',
          type: 'interactive',
          source: {
            kind: 'template',
            templateId: 'wooden-fish',
            parameters: { requiredHits: 3 },
          },
        }],
      }],
    })
    expect(result.ok).toBe(false)
  })

  it('拒绝启用尚未预览的自定义文档', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{
        ...validRule,
        challenges: [{
          id: 'custom',
          type: 'interactive',
          source: {
            kind: 'custom',
            document: { html: '<!doctype html><button>完成</button>', reviewState: 'required' },
          },
        }],
      }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('；')).toContain('尚未预览')
  })

  it('允许读取待审查的导入文档，以便随后自动停用规则', () => {
    const result = validateExportBundle({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportedAt: '2026-08-25T00:00:00.000Z',
      rules: [{
        ...validRule,
        challenges: [{
          id: 'custom',
          type: 'interactive',
          source: {
            kind: 'custom',
            document: { html: '<!doctype html><button>完成</button>', reviewState: 'required' },
          },
        }],
      }],
    })
    expect(result.ok).toBe(true)
  })

  it('拒绝超过单文档限制的自定义 HTML', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{
        ...validRule,
        enabled: false,
        challenges: [{
          id: 'custom',
          type: 'interactive',
          source: {
            kind: 'custom',
            document: { html: 'a'.repeat(256 * 1024 + 1), reviewState: 'required' },
          },
        }],
      }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('；')).toContain('256KB')
  })
})
