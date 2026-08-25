import type { AccessRule, ChallengeStep, CustomChallengeDocument } from './types'

export function customDocumentForStep(step: ChallengeStep): CustomChallengeDocument | undefined {
  if (step.type === 'text') {
    return step.scene.kind === 'custom' ? step.scene.document : undefined
  }
  return step.source.kind === 'custom' ? step.source.document : undefined
}

export function hasCustomDocuments(rule: AccessRule): boolean {
  return rule.challenges.some((step) => customDocumentForStep(step) !== undefined)
}

export function hasUnreviewedDocuments(rule: AccessRule): boolean {
  return rule.challenges.some((step) => customDocumentForStep(step)?.reviewState === 'required')
}

export function markCustomDocumentsForReview(rule: AccessRule): AccessRule {
  const next = structuredClone(rule)
  for (const step of next.challenges) {
    const document = customDocumentForStep(step)
    if (document) document.reviewState = 'required'
  }
  if (hasCustomDocuments(next)) next.enabled = false
  return next
}
