import type {
  AccessRule,
  PolicyEvaluation,
  PublicAccessRule,
  RuntimeState,
} from '../domain/types'

export type RuntimeRequest =
  | { type: 'config:get' }
  | { type: 'config:save'; rules: unknown }
  | { type: 'gate:get-context'; ruleId: string }
  | { type: 'gate:submit'; ruleId: string; stepIndex: number; answer: string }
  | { type: 'navigation:spa'; url: string }
  | { type: 'status:get'; url: string; ruleId?: string }

export interface GateContext {
  rule: PublicAccessRule
  evaluation: PolicyEvaluation
  stepIndex: number
  originalUrl?: string
  now: number
}

export type GateSubmitResponse =
  | { ok: false; error: string }
  | { ok: true; complete: false; nextStepIndex: number }
  | { ok: true; complete: true; redirectUrl?: string }

export interface RuleStatus {
  rule?: PublicAccessRule
  evaluation?: PolicyEvaluation
  runtime?: RuntimeState
  now: number
}

export function toPublicRule(rule: AccessRule): PublicAccessRule {
  return {
    ...rule,
    challenges: rule.challenges.map(({ id }) => ({ id })),
  }
}
