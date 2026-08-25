export const CONFIG_SCHEMA_VERSION = 2 as const

export type Scheme = 'http' | 'https'
export type RuleMode = 'password' | 'schedule' | 'combined'

export interface TargetPattern {
  schemes: Scheme[]
  host: string
  includeSubdomains: boolean
  path: string
}

export interface ChallengeStep {
  id: string
  prompt: string
  answer: string
}

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
  dnrRuleId: number
  name: string
  enabled: boolean
  priority: number
  target: TargetPattern
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
  | 'calendar-verified'
  | 'calendar-closed'

export interface PolicyEvaluation {
  state: 'allowed' | 'challenge' | 'waiting'
  reason: EvaluationReason
  nextChangeAt?: number
}

export interface PublicChallengeStep {
  id: string
  prompt: string
}

export type PublicAccessRule = Omit<AccessRule, 'challenges'> & {
  challenges: PublicChallengeStep[]
}
