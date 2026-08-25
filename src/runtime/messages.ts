import type {
  AccessRule,
  PolicyEvaluation,
  PublicAccessRule,
  PublicGateChallengeStep,
  RuntimeState,
} from '../domain/types'

export type RuntimeRequest =
  | { type: 'config:get' }
  | { type: 'config:save'; rules: unknown }
  | { type: 'gate:get-context'; ruleId: string }
  | { type: 'gate:submit-text'; ruleId: string; stepId: string; stepIndex: number; sessionId: string; answer: string }
  | { type: 'gate:complete-interactive'; ruleId: string; stepId: string; stepIndex: number; sessionId: string }
  | { type: 'navigation:spa'; url: string }
  | { type: 'status:get'; url: string; ruleId?: string }

export interface GateContext {
  rule: Pick<AccessRule, 'id' | 'name'>
  evaluation: PolicyEvaluation
  stepIndex: number
  totalSteps: number
  step?: PublicGateChallengeStep
  sessionId: string
  originalUrl?: string
  now: number
}

export type GateAdvanceResponse =
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
    challenges: rule.challenges.map(({ id, type }) => ({ id, type })),
  }
}

export function toPublicGateStep(
  step: AccessRule['challenges'][number],
): PublicGateChallengeStep {
  if (step.type === 'text') {
    return { id: step.id, type: step.type, scene: step.scene }
  }
  return step
}
