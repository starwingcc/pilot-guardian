import { describe, expect, it } from 'vitest'
import type { AccessRule } from './types'
import {
  findMatchingRule,
  hasOverlappingPatterns,
  matchesUrlPattern,
  parseUrlPattern,
  patternSetsMayOverlap,
  patternsMayOverlap,
  urlPatternToDnrRegex,
} from './url-pattern'

const target = 'https://*.example.com/focus/*'

function rule(id: string, priority: number, urlPatterns = [target]): AccessRule {
  return {
    id,
    name: id,
    enabled: true,
    priority,
    urlPatterns,
    mode: 'password',
    challenges: [{ id: `${id}-step`, type: 'text', answer: 'answer', scene: { kind: 'default' } }],
    accessDurationMinutes: 30,
  }
}

describe('URL 规则', () => {
  it('只接受规范的 Chrome 风格 URL 模式子集', () => {
    expect(parseUrlPattern('*://*.example.com/focus/*').ok).toBe(true)
    expect(parseUrlPattern('HTTPS://example.com/*').ok).toBe(false)
    expect(parseUrlPattern('https://example.com').ok).toBe(false)
    expect(parseUrlPattern('https://example.com:8443/*').ok).toBe(false)
    expect(parseUrlPattern('https://example.com/*?from=home').ok).toBe(false)
    expect(parseUrlPattern(' https://example.com/*').ok).toBe(false)
  })

  it('匹配协议、子域和路径，并忽略 query 与 hash', () => {
    expect(matchesUrlPattern(target, 'https://news.example.com/focus/today?from=home#top')).toBe(
      true,
    )
    expect(matchesUrlPattern(target, 'https://example.com:8443/focus/today')).toBe(true)
    expect(matchesUrlPattern(target, 'http://news.example.com/focus/today')).toBe(false)
    expect(matchesUrlPattern(target, 'https://example.com/other')).toBe(false)
  })

  it('不会把相似后缀域名当成子域', () => {
    expect(matchesUrlPattern(target, 'https://notexample.com/focus/today')).toBe(false)
  })

  it('同一规则按 OR 匹配多条 URL，并只返回优先级最高的启用规则', () => {
    const low = rule('low', 8)
    const high = rule('high', 0, ['https://linux.do/*', 'https://example.com/*'])
    expect(findMatchingRule([low, high], 'https://linux.do/t/1')?.id).toBe('high')
    high.enabled = false
    expect(findMatchingRule([low, high], 'https://example.com/focus/one')?.id).toBe('low')
  })

  it('检测单条、同规则及跨规则的明显重叠', () => {
    const broad = '*://*.example.com/*'
    const narrow = 'https://news.example.com/focus/*'
    expect(patternsMayOverlap(broad, narrow)).toBe(true)
    expect(hasOverlappingPatterns([broad, narrow])).toBe(true)
    expect(patternSetsMayOverlap([broad], ['https://other.com/*', narrow])).toBe(true)
  })

  it('生成可验证的 DNR 正则', () => {
    const regex = new RegExp(urlPatternToDnrRegex(target))
    expect(regex.test('https://example.com/focus/a?x=1')).toBe(true)
    expect(regex.test('https://deep.news.example.com/focus/a')).toBe(true)
    expect(regex.test('https://example.com/nope')).toBe(false)
  })
})
