import type { AccessRule } from './types'

const REGEX_META = /[.*+?^${}()|[\]\\]/g
const pathRegexCache = new Map<string, RegExp>()
const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const URL_PATTERN_REGEX = new RegExp(
  `^(http|https|\\*):\\/\\/(\\*\\.)?(${HOST_LABEL}(?:\\.${HOST_LABEL})+)(\\/[^\\s?#]*)$`,
)

type PatternScheme = 'http' | 'https'

export interface ParsedUrlPattern {
  schemes: PatternScheme[]
  host: string
  includeSubdomains: boolean
  path: string
}

export type UrlPatternParseResult =
  { ok: true; value: ParsedUrlPattern } | { ok: false; error: string }

function escapeRegex(value: string): string {
  return value.replace(REGEX_META, '\\$&')
}

function pathRegex(path: string): RegExp {
  const cached = pathRegexCache.get(path)
  if (cached) return cached

  const expression = `^${escapeRegex(path).replace(/\\\*/g, '.*')}$`
  const regex = new RegExp(expression)
  pathRegexCache.set(path, regex)
  return regex
}

export function parseUrlPattern(pattern: string): UrlPatternParseResult {
  if (!pattern) return { ok: false, error: 'URL 模式不能为空' }
  if (pattern !== pattern.trim()) {
    return { ok: false, error: 'URL 模式不能包含首尾空白' }
  }
  if (pattern.includes('?') || pattern.includes('#')) {
    return { ok: false, error: 'URL 模式不能包含查询参数或片段' }
  }
  const match = URL_PATTERN_REGEX.exec(pattern)
  if (!match) {
    return {
      ok: false,
      error: '请使用规范格式，例如 https://linux.do/* 或 *://*.linux.do/*',
    }
  }
  const scheme = match[1]
  const host = match[3]
  const path = match[4]
  if (!scheme || !host || !path) {
    return { ok: false, error: 'URL 模式无效' }
  }
  return {
    ok: true,
    value: {
      schemes: scheme === '*' ? ['http', 'https'] : [scheme as PatternScheme],
      host,
      includeSubdomains: Boolean(match[2]),
      path,
    },
  }
}

export function matchesUrlPattern(pattern: string, candidate: string): boolean {
  const parsed = parseUrlPattern(pattern)
  if (!parsed.ok) return false

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }

  const scheme = url.protocol.slice(0, -1) as PatternScheme
  if (!parsed.value.schemes.includes(scheme)) return false

  const expectedHost = parsed.value.host
  const actualHost = url.hostname.toLowerCase()
  const hostMatches =
    actualHost === expectedHost ||
    (parsed.value.includeSubdomains && actualHost.endsWith(`.${expectedHost}`))

  return hostMatches && pathRegex(parsed.value.path).test(url.pathname)
}

export function findMatchingRule(rules: AccessRule[], url: string): AccessRule | undefined {
  let best: AccessRule | undefined
  for (const rule of rules) {
    if (!rule.enabled || !rule.urlPatterns.some((pattern) => matchesUrlPattern(pattern, url)))
      continue
    if (!best || rule.priority < best.priority) best = rule
  }
  return best
}

function hostsMayOverlap(left: ParsedUrlPattern, right: ParsedUrlPattern): boolean {
  const a = left.host
  const b = right.host
  if (a === b) return true
  if (left.includeSubdomains && b.endsWith(`.${a}`)) return true
  return right.includeSubdomains && a.endsWith(`.${b}`)
}

function pathsMayOverlap(left: string, right: string): boolean {
  const aPrefix = left.split('*', 1)[0] ?? '/'
  const bPrefix = right.split('*', 1)[0] ?? '/'
  return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix)
}

export function patternsMayOverlap(left: string, right: string): boolean {
  const parsedLeft = parseUrlPattern(left)
  const parsedRight = parseUrlPattern(right)
  if (!parsedLeft.ok || !parsedRight.ok) return false

  const schemeOverlap = parsedLeft.value.schemes.some((scheme) =>
    parsedRight.value.schemes.includes(scheme),
  )
  return (
    schemeOverlap &&
    hostsMayOverlap(parsedLeft.value, parsedRight.value) &&
    pathsMayOverlap(parsedLeft.value.path, parsedRight.value.path)
  )
}

export function patternSetsMayOverlap(left: string[], right: string[]): boolean {
  return left.some((leftPattern) =>
    right.some((rightPattern) => patternsMayOverlap(leftPattern, rightPattern)),
  )
}

export function hasOverlappingPatterns(patterns: string[]): boolean {
  return patterns.some((pattern, index) =>
    patterns.slice(index + 1).some((other) => patternsMayOverlap(pattern, other)),
  )
}

export function urlPatternToDnrRegex(pattern: string): string {
  const parsed = parseUrlPattern(pattern)
  if (!parsed.ok) throw new Error(parsed.error)

  const scheme = parsed.value.schemes.length === 2 ? 'https?' : parsed.value.schemes[0]
  const host = escapeRegex(parsed.value.host)
  const hostExpression = parsed.value.includeSubdomains ? `(?:[^./:]+\\.)*${host}` : host
  const path = escapeRegex(parsed.value.path).replace(/\\\*/g, '.*')
  return `^${scheme}://${hostExpression}(?::[0-9]+)?${path}(?:[?].*)?$`
}
