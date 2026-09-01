import {
  CONFIG_SCHEMA_VERSION,
  MAX_CONFIG_BYTES,
  MAX_CUSTOM_DOCUMENT_BYTES,
  MAX_DYNAMIC_URL_PATTERNS,
  type AccessRule,
  type ChallengeStep,
  type CustomChallengeDocument,
  type DailyWindow,
  type ExportBundle,
  type MonthlySchedule,
  type Schedule,
  type StoredConfig,
  type TextChallengeScene,
  type WeeklySchedule,
} from './types'
import { parseUrlPattern } from './url-pattern'

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function parseSchedule(value: unknown, errors: string[], label: string): Schedule | undefined {
  if (!isRecord(value)) {
    errors.push(`${label}缺少周期配置`)
    return undefined
  }
  if (value.kind === 'interval') {
    if (!Number.isInteger(value.intervalDays) || (value.intervalDays as number) <= 0) {
      errors.push(`${label}的间隔天数必须是正整数`)
      return undefined
    }
    return { kind: 'interval', intervalDays: value.intervalDays as number }
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
      ? value.monthDays.filter(
          (day): day is number => Number.isInteger(day) && day >= 1 && day <= 31,
        )
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

function isValidWindowMinutes(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false
  return value >= 0 && value <= 1439
}

function parseDailyWindow(
  value: unknown,
  errors: string[],
  label: string,
): DailyWindow | undefined {
  if (
    isRecord(value) &&
    isValidWindowMinutes(value.startMinutes) &&
    isValidWindowMinutes(value.endMinutes)
  ) {
    if (value.startMinutes === value.endMinutes) {
      errors.push(`${label}的允许时段起止不能相同`)
      return undefined
    }
    return { startMinutes: value.startMinutes, endMinutes: value.endMinutes }
  }
  errors.push(`${label}的允许时段无效`)
  return undefined
}

function parseDocument(
  value: unknown,
  errors: string[],
  label: string,
): CustomChallengeDocument | undefined {
  if (!isRecord(value) || typeof value.html !== 'string' || !value.html.trim()) {
    errors.push(`${label}缺少自定义 HTML`)
    return undefined
  }
  if (utf8Size(value.html) > MAX_CUSTOM_DOCUMENT_BYTES) {
    errors.push(`${label}超过 256KB 上限`)
  }
  return {
    html: value.html,
    reviewState: value.reviewState === 'ready' ? 'ready' : 'required',
  }
}

function parseTextScene(value: unknown, errors: string[], label: string): TextChallengeScene {
  if (!isRecord(value) || value.kind === 'default') return { kind: 'default' }
  if (value.kind === 'custom') {
    const document = parseDocument(value.document, errors, `${label}的挑战场景`)
    if (document) return { kind: 'custom', document }
  } else {
    errors.push(`${label}的挑战场景类型无效`)
  }
  return { kind: 'default' }
}

function parseChallenge(
  value: unknown,
  index: number,
  errors: string[],
  ruleLabel: string,
): ChallengeStep | undefined {
  const label = `${ruleLabel}的第 ${index + 1} 个挑战步骤`
  if (!isRecord(value)) {
    errors.push(`${label}无效`)
    return undefined
  }
  const id = typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID()
  if (value.type === 'text') {
    const answer = typeof value.answer === 'string' ? value.answer : ''
    if (!answer) errors.push(`${label}缺少文本答案`)
    return {
      id,
      type: 'text',
      answer,
      scene: parseTextScene(value.scene, errors, label),
    }
  }
  if (value.type === 'interactive') {
    if (!isRecord(value.source)) {
      errors.push(`${label}缺少互动来源`)
      return undefined
    }
    if (value.source.kind !== 'custom') {
      errors.push(`${label}的互动来源类型无效`)
      return undefined
    }
    const document = parseDocument(value.source.document, errors, `${label}的互动文档`)
    return document ? { id, type: 'interactive', source: { kind: 'custom', document } } : undefined
  }
  errors.push(`${label}的挑战类型无效`)
  return undefined
}

function hasPendingReview(rule: AccessRule): boolean {
  return rule.challenges.some((challenge) => {
    if (challenge.type === 'text') {
      return (
        challenge.scene.kind === 'custom' && challenge.scene.document.reviewState === 'required'
      )
    }
    return challenge.source.document.reviewState === 'required'
  })
}

function parseRule(
  value: unknown,
  index: number,
  errors: string[],
  allowEnabledPendingReview: boolean,
): AccessRule | undefined {
  const label = `第 ${index + 1} 条规则`
  if (!isRecord(value)) {
    errors.push(`${label}不是有效对象`)
    return undefined
  }
  if (!Array.isArray(value.urlPatterns)) {
    errors.push(`${label}缺少受控目标`)
    return undefined
  }

  const urlPatterns = value.urlPatterns.flatMap((pattern, patternIndex) => {
    const patternLabel = `${label}的第 ${patternIndex + 1} 条 URL 模式`
    if (typeof pattern !== 'string') {
      errors.push(`${patternLabel}无效`)
      return []
    }
    const parsed = parseUrlPattern(pattern)
    if (!parsed.ok) errors.push(`${patternLabel}：${parsed.error}`)
    return [pattern]
  })
  if (urlPatterns.length === 0) errors.push(`${label}至少需要一条 URL 模式`)
  const seenPatterns = new Set<string>()
  for (const pattern of urlPatterns) {
    if (seenPatterns.has(pattern)) errors.push(`${label}包含重复的 URL 模式：${pattern}`)
    seenPatterns.add(pattern)
  }

  const mode = value.mode
  if (mode !== 'password' && mode !== 'schedule' && mode !== 'combined') {
    errors.push(`${label}的策略模式无效`)
    return undefined
  }

  const challenges =
    mode === 'schedule'
      ? []
      : Array.isArray(value.challenges)
        ? value.challenges.flatMap((challenge, challengeIndex) => {
            const parsed = parseChallenge(challenge, challengeIndex, errors, label)
            return parsed ? [parsed] : []
          })
        : []
  if (mode !== 'schedule' && challenges.length === 0) errors.push(`${label}至少需要一个挑战步骤`)

  const schedule = mode === 'password' ? undefined : parseSchedule(value.schedule, errors, label)
  const dailyWindow =
    value.dailyWindow === undefined ? undefined : parseDailyWindow(value.dailyWindow, errors, label)
  const accessDurationMinutes = value.accessDurationMinutes
  if (!isPositiveNumber(accessDurationMinutes) || accessDurationMinutes > 10_080) {
    errors.push(`${label}的放行时长必须在 1 到 10080 分钟之间`)
  }

  const rule: AccessRule = {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name:
      typeof value.name === 'string' && value.name.trim() ? value.name.trim() : `规则 ${index + 1}`,
    enabled: value.enabled !== false,
    priority: index,
    urlPatterns,
    mode,
    challenges,
    accessDurationMinutes: isPositiveNumber(accessDurationMinutes)
      ? Math.min(accessDurationMinutes, 10_080)
      : 30,
  }
  if (schedule) rule.schedule = schedule
  if (dailyWindow) rule.dailyWindow = dailyWindow
  if (!allowEnabledPendingReview && rule.enabled && hasPendingReview(rule)) {
    errors.push(`${label}包含尚未预览的自定义文档，预览后才能启用`)
  }
  return rule
}

function parseRules(
  value: unknown,
  options: { allowEnabledPendingReview?: boolean } = {},
): ValidationResult<AccessRule[]> {
  if (!Array.isArray(value)) return { ok: false, errors: ['规则列表无效'] }
  const errors: string[] = []
  const rules = value.flatMap((rule, index) => {
    const parsed = parseRule(rule, index, errors, options.allowEnabledPendingReview === true)
    return parsed ? [parsed] : []
  })

  const ids = new Set<string>()
  for (const rule of rules) {
    if (ids.has(rule.id)) errors.push(`规则 ID 重复：${rule.id}`)
    ids.add(rule.id)
  }
  const urlPatternCount = rules.reduce((total, rule) => total + rule.urlPatterns.length, 0)
  if (urlPatternCount > MAX_DYNAMIC_URL_PATTERNS) {
    errors.push(`URL 模式总数不能超过 ${MAX_DYNAMIC_URL_PATTERNS} 条`)
  }
  const serializedSize = utf8Size(JSON.stringify({ schemaVersion: CONFIG_SCHEMA_VERSION, rules }))
  if (serializedSize > MAX_CONFIG_BYTES) errors.push('配置总大小超过 2MB 上限')
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
  const rules = parseRules(input.rules, { allowEnabledPendingReview: true })
  if (!rules.ok) return rules
  return {
    ok: true,
    value: {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportedAt:
        typeof input.exportedAt === 'string' ? input.exportedAt : new Date().toISOString(),
      rules: rules.value,
    },
  }
}
