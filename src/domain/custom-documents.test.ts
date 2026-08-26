import { describe, expect, it } from 'vitest'
import type { AccessRule } from './types'
import { hasUnreviewedDocuments, markCustomDocumentsForReview } from './custom-documents'

const rule: AccessRule = {
  id: 'custom-rule',
  name: '自定义挑战',
  enabled: true,
  priority: 0,
  urlPatterns: ['https://example.com/*'],
  mode: 'password',
  challenges: [{
    id: 'step',
    type: 'interactive',
    source: {
      kind: 'custom',
      document: { html: '<!doctype html><button>完成</button>', reviewState: 'ready' },
    },
  }],
  accessDurationMinutes: 30,
}

describe('自定义挑战文档', () => {
  it('导入时停用包含自定义代码的规则并要求重新预览', () => {
    const imported = markCustomDocumentsForReview(rule)
    expect(imported.enabled).toBe(false)
    expect(hasUnreviewedDocuments(imported)).toBe(true)
    expect(rule.enabled).toBe(true)
  })
})
