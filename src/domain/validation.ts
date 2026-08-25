import {
  CONFIG_SCHEMA_VERSION,
  type AccessRule,
  type ExportBundle,
  type MonthlySchedule,
  type Schedule,
  type StoredConfig,
  type WeeklySchedule,
} from './types'
import { normalizeHost, normalizePath } from './url-pattern'

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function parseSchedule(value: unknown, errors: string[], label: string): Schedule | undefined {
  if (!isRecord(value)) {
    errors.push(`${label}缺少周期配置`)
    return undefined
  }
  if (value.kind === 'interval') {
    if (!isPositiveNumber(value.intervalDays)) {
      errors.push(`${label}的间隔天数必须大于 0`)
      return undefined
    }
    return { kind: 'interval', intervalDays: value.intervalDays }
  }
  if (value.kind === 'weekly') {
    const weekdays = Array.isArray(value.weekdays)
      ? value.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : []
    if (weekdays.length === 0) errors.push(`${label}至少选择一个星期日`)
    return { kind: 'weekly', weekdays: [...new Set(weekdays)] } satisfies WeeklySchedule
  }
  if (value.kind === 'monthly') {
    const monthDays = Array.isArray(value.monthDays)
      ? value.monthDays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 31)
      : []
    const includeLastDay = value.includeLastDay === true
    if (monthDays.length === 0 && !includeLastDay) errors.push(`${label}至少选择一个月份日`)
    return {
      kind: 'monthly',
      monthDays: [...new Set(monthDays)],
      includeLastDay,
    } satisfies MonthlySchedule
  }
  errors.push(`${label}的周期类型无效`)
  return undefined
}

function parseRule(value: unknown, index: number, errors: string[]): AccessRule | undefined {
  const label = `第 ${index + 1} 条规则`
  if (!isRecord(value)) {
    errors.push(`${label}不是有效对象`)
    return undefined
  }
  if (!isRecord(value.target)) {
    errors.push(`${label}缺少受控目标`)
    return undefined
  }

  const host = typeof value.target.host === 'string' ? normalizeHost(value.target.host) : ''
  if (!host || !host.includes('.') || host.includes('/')) errors.push(`${label}的主机名无效`)
  const rawSchemes = Array.isArray(value.target.schemes) ? value.target.schemes : []
  const schemes = rawSchemes.filter((scheme): scheme is 'http' | 'https' =>
    scheme === 'http' || scheme === 'https',
  )
  if (schemes.length === 0) errors.push(`${label}至少选择一个协议`)

  const mode = value.mode
  if (mode !== 'password' && mode !== 'schedule' && mode !== 'combined') {
    errors.push(`${label}的策略模式无效`)
    return undefined
  }

  const challenges = Array.isArray(value.challenges)
      ? value.challenges.flatMap((challenge, challengeIndex) => {
        if (!isRecord(challenge)) return []
        const answer = typeof challenge.answer === 'string' ? challenge.answer : ''
        if (!answer) errors.push(`${label}的第 ${challengeIndex + 1} 道口令不完整`)
        return [{
          id: typeof challenge.id === 'string' && challenge.id ? challenge.id : crypto.randomUUID(),
          answer,
        }]
      })
    : []
  if (mode !== 'schedule' && challenges.length === 0) errors.push(`${label}至少需要一道口令`)

  const schedule = mode === 'password'
    ? undefined
    : parseSchedule(value.schedule, errors, label)
  const accessDurationMinutes = value.accessDurationMinutes
  if (!isPositiveNumber(accessDurationMinutes) || accessDurationMinutes > 10_080) {
    errors.push(`${label}的放行时长必须在 1 到 10080 分钟之间`)
  }

  if (errors.length > 0 && (!host || schemes.length === 0)) return undefined

  const rule: AccessRule = {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    dnrRuleId: Number.isInteger(value.dnrRuleId) && Number(value.dnrRuleId) > 0
      ? Number(value.dnrRuleId)
      : index + 1,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : `规则 ${index + 1}`,
    enabled: value.enabled !== false,
    priority: index,
    target: {
      schemes: [...new Set(schemes)],
      host,
      includeSubdomains: value.target.includeSubdomains === true,
      path: normalizePath(typeof value.target.path === 'string' ? value.target.path : '/*'),
    },
    mode,
    challenges,
    accessDurationMinutes: isPositiveNumber(accessDurationMinutes)
      ? Math.min(accessDurationMinutes, 10_080)
      : 30,
  }
  if (schedule) rule.schedule = schedule
  return rule
}

function parseRules(value: unknown): ValidationResult<AccessRule[]> {
  if (!Array.isArray(value)) return { ok: false, errors: ['规则列表无效'] }
  const errors: string[] = []
  const rules = value.flatMap((rule, index) => {
    const parsed = parseRule(rule, index, errors)
    return parsed ? [parsed] : []
  })

  const ids = new Set<string>()
  const dnrIds = new Set<number>()
  for (const rule of rules) {
    if (ids.has(rule.id)) errors.push(`规则 ID 重复：${rule.id}`)
    if (dnrIds.has(rule.dnrRuleId)) errors.push(`DNR 规则 ID 重复：${rule.dnrRuleId}`)
    ids.add(rule.id)
    dnrIds.add(rule.dnrRuleId)
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: rules }
}

export function validateStoredConfig(input: unknown): ValidationResult<StoredConfig> {
  if (!isRecord(input) || input.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return { ok: false, errors: ['不支持的配置版本'] }
  }
  const rules = parseRules(input.rules)
  return rules.ok
    ? { ok: true, value: { schemaVersion: CONFIG_SCHEMA_VERSION, rules: rules.value } }
    : rules
}

export function validateExportBundle(input: unknown): ValidationResult<ExportBundle> {
  if (!isRecord(input) || input.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return { ok: false, errors: ['不支持的导出文件版本'] }
  }
  const rules = parseRules(input.rules)
  if (!rules.ok) return rules
  return {
    ok: true,
    value: {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : new Date().toISOString(),
      rules: rules.value,
    },
  }
}
