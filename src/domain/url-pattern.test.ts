import { describe, expect, it } from 'vitest'
import type { AccessRule, TargetPattern } from './types'
import { findMatchingRule, matchesTarget, patternsMayOverlap, targetToDnrRegex } from './url-pattern'

const target: TargetPattern = {
  schemes: ['https'],
  host: 'example.com',
  includeSubdomains: true,
  path: '/focus/*',
}

function rule(id: string, priority: number, pattern = target): AccessRule {
  return {
    id,
    dnrRuleId: priority + 1,
    name: id,
    enabled: true,
    priority,
    target: pattern,
    mode: 'password',
    challenges: [{ id: `${id}-step`, type: 'text', answer: 'answer', scene: { kind: 'default' } }],
    accessDurationMinutes: 30,
  }
}

describe('URL 规则', () => {
  it('匹配协议、子域和路径，并忽略 query 与 hash', () => {
    expect(matchesTarget(target, 'https://news.example.com/focus/today?from=home#top')).toBe(true)
    expect(matchesTarget(target, 'http://news.example.com/focus/today')).toBe(false)
    expect(matchesTarget(target, 'https://example.com/other')).toBe(false)
  })

  it('不会把相似后缀域名当成子域', () => {
    expect(matchesTarget(target, 'https://notexample.com/focus/today')).toBe(false)
  })

  it('只返回优先级最高的启用规则', () => {
    const low = rule('low', 8)
    const high = rule('high', 0)
    expect(findMatchingRule([low, high], 'https://example.com/focus/one')?.id).toBe('high')
    high.enabled = false
    expect(findMatchingRule([low, high], 'https://example.com/focus/one')?.id).toBe('low')
  })

  it('检测明显重叠的主机与路径模式', () => {
    const broad = { ...target, path: '/*' }
    const narrow = { ...target, host: 'news.example.com', includeSubdomains: false }
    expect(patternsMayOverlap(broad, narrow)).toBe(true)
  })

  it('生成可验证的 DNR 正则', () => {
    const regex = new RegExp(targetToDnrRegex(target))
    expect(regex.test('https://example.com/focus/a?x=1')).toBe(true)
    expect(regex.test('https://deep.news.example.com/focus/a')).toBe(true)
    expect(regex.test('https://example.com/nope')).toBe(false)
  })
})
