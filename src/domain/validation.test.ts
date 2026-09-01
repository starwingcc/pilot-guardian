import { describe, expect, it } from 'vitest'
import { CONFIG_SCHEMA_VERSION } from './types'
import { validateExportBundle, validateStoredConfig } from './validation'

const validRule = {
  id: 'one',
  name: '百度',
  enabled: true,
  priority: 9,
  urlPatterns: ['https://www.baidu.com/*'],
  mode: 'password',
  challenges: [{ id: 'step', type: 'text', answer: '明文答案', scene: { kind: 'default' } }],
  accessDurationMinutes: 30,
}

describe('配置校验', () => {
  it('规范化优先级并保留明文答案', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [validRule],
    })
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

  it('周期规则忽略未使用的空挑战', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          mode: 'schedule',
          schedule: { kind: 'weekly', weekdays: [1] },
          challenges: [{ ...validRule.challenges[0], answer: '' }],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rules[0]?.challenges).toEqual([])
  })

  it('间隔天数只接受正整数', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          mode: 'schedule',
          schedule: { kind: 'interval', intervalDays: 1.5 },
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('；')).toContain('正整数')
  })

  it('解析可选的允许时段', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{ ...validRule, dailyWindow: { startMinutes: 20 * 60, endMinutes: 23 * 60 } }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rules[0]?.dailyWindow).toEqual({ startMinutes: 1200, endMinutes: 1380 })
  })

  it('拒绝非法或起止相同的允许时段', () => {
    const invalid = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{ ...validRule, dailyWindow: { startMinutes: 1500, endMinutes: 120 } }],
    })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.errors.join('；')).toContain('允许时段')

    const same = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{ ...validRule, dailyWindow: { startMinutes: 600, endMinutes: 600 } }],
    })
    expect(same.ok).toBe(false)
    if (!same.ok) expect(same.errors.join('；')).toContain('起止')
  })

  it('拒绝非规范、空白和重复的 URL 模式', () => {
    const invalid = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [{ ...validRule, urlPatterns: ['HTTPS://example.com/*'] }],
    })
    expect(invalid.ok).toBe(false)

    const duplicate = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          urlPatterns: ['https://example.com/*', 'https://example.com/*'],
        },
      ],
    })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.errors.join('；')).toContain('重复')
  })

  it('拒绝超过 DNR 上限的 URL 模式总数', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          urlPatterns: Array.from(
            { length: 5_001 },
            (_, index) => `https://example.com/${index}/*`,
          ),
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('；')).toContain('5000')
  })

  it('拒绝不支持的导出版本', () => {
    const result = validateExportBundle({ schemaVersion: 99, exportedAt: '', rules: [] })
    expect(result).toEqual({ ok: false, errors: ['不支持的导出文件版本'] })
  })

  it('拒绝不兼容的存储配置', () => {
    const result = validateStoredConfig({
      schemaVersion: 3,
      rules: [validRule],
    })
    expect(result).toEqual({ ok: false, errors: ['不支持的配置版本'] })
  })

  it('拒绝不兼容的导出文件', () => {
    const result = validateExportBundle({
      schemaVersion: 3,
      exportedAt: '2025-01-01T00:00:00.000Z',
      rules: [validRule],
    })
    expect(result).toEqual({ ok: false, errors: ['不支持的导出文件版本'] })
  })

  it('接受从官方模板载入并审核过的自定义交互文档', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          challenges: [
            {
              id: 'interactive',
              type: 'interactive',
              source: {
                kind: 'custom',
                document: {
                  html: `<!doctype html><script type="application/json" id="pg-params">{"minimumDelay":1500,"maximumDelay":4000,"successWindow":600}</script><button>响应</button>`,
                  reviewState: 'ready',
                },
              },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('拒绝旧版官方模板引用(kind: template)', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          challenges: [
            {
              id: 'interactive',
              type: 'interactive',
              source: {
                kind: 'template',
                templateId: 'wooden-fish',
                parameters: { requiredHits: 3 },
              },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('拒绝启用尚未预览的自定义文档', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          challenges: [
            {
              id: 'custom',
              type: 'interactive',
              source: {
                kind: 'custom',
                document: { html: '<!doctype html><button>完成</button>', reviewState: 'required' },
              },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('；')).toContain('尚未预览')
  })

  it('允许读取待审查的导入文档，以便随后自动停用规则', () => {
    const result = validateExportBundle({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportedAt: '2026-08-25T00:00:00.000Z',
      rules: [
        {
          ...validRule,
          challenges: [
            {
              id: 'custom',
              type: 'interactive',
              source: {
                kind: 'custom',
                document: { html: '<!doctype html><button>完成</button>', reviewState: 'required' },
              },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('拒绝超过单文档限制的自定义 HTML', () => {
    const result = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [
        {
          ...validRule,
          enabled: false,
          challenges: [
            {
              id: 'custom',
              type: 'interactive',
              source: {
                kind: 'custom',
                document: { html: 'a'.repeat(256 * 1024 + 1), reviewState: 'required' },
              },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('；')).toContain('256KB')
  })
})
