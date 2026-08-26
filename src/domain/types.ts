export const CONFIG_SCHEMA_VERSION = 4 as const
export const MAX_CUSTOM_DOCUMENT_BYTES = 256 * 1024
export const MAX_CONFIG_BYTES = 2 * 1024 * 1024
export const MAX_DYNAMIC_URL_PATTERNS = 5_000

export type RuleMode = 'password' | 'schedule' | 'combined'

export interface CustomChallengeDocument {
  html: string
  reviewState: 'ready' | 'required'
}

export type TextChallengeScene =
  | { kind: 'default' }
  | { kind: 'custom'; document: CustomChallengeDocument }

export interface TextChallengeStep {
  id: string
  type: 'text'
  answer: string
  scene: TextChallengeScene
}

export interface CustomInteractiveSource {
  kind: 'custom'
  document: CustomChallengeDocument
}

export interface InteractiveChallengeStep {
  id: string
  type: 'interactive'
  source: CustomInteractiveSource
}

export type ChallengeStep = TextChallengeStep | InteractiveChallengeStep

export interface IntervalSchedule {
  kind: 'interval'
  intervalDays: number
}

export interface WeeklySchedule {
  kind: 'weekly'
  weekdays: number[]
}

export interface MonthlySchedule {
  kind: 'monthly'
  monthDays: number[]
  includeLastDay: boolean
}

export type Schedule = IntervalSchedule | WeeklySchedule | MonthlySchedule

export interface AccessRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  urlPatterns: string[]
  mode: RuleMode
  challenges: ChallengeStep[]
  schedule?: Schedule
  accessDurationMinutes: number
}

export interface RuntimeState {
  activeUntil?: number
  lastWindowEndedAt?: number
  verifiedCalendarKey?: string
}

export interface StoredConfig {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION
  rules: AccessRule[]
}

export interface RuntimeStore {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION
  byRuleId: Record<string, RuntimeState>
}

export interface ExportBundle {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION
  exportedAt: string
  rules: AccessRule[]
}

export type EvaluationReason =
  | 'active-window'
  | 'password-required'
  | 'interval-ready'
  | 'cooldown'
  | 'calendar-open'
  | 'calendar-closed'

export interface PolicyEvaluation {
  state: 'allowed' | 'challenge' | 'waiting'
  reason: EvaluationReason
  nextChangeAt?: number
}

export interface PublicChallengeStep {
  id: string
  type: ChallengeStep['type']
}

export type PublicGateChallengeStep =
  | Omit<TextChallengeStep, 'answer'>
  | InteractiveChallengeStep

export type PublicAccessRule = Omit<AccessRule, 'challenges'> & {
  challenges: PublicChallengeStep[]
}
