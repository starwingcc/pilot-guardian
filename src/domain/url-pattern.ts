import type { AccessRule, Scheme, TargetPattern } from './types'

const REGEX_META = /[.*+?^${}()|[\]\\]/g
const pathRegexCache = new Map<string, RegExp>()

function escapeRegex(value: string): string {
  return value.replace(REGEX_META, '\\$&')
}

function pathRegex(path: string): RegExp {
  const normalized = normalizePath(path)
  const cached = pathRegexCache.get(normalized)
  if (cached) return cached

  const expression = `^${escapeRegex(normalized).replace(/\\\*/g, '.*')}$`
  const regex = new RegExp(expression)
  pathRegexCache.set(normalized, regex)
  return regex
}

export function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '/*'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
}

export function matchesTarget(pattern: TargetPattern, candidate: string): boolean {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }

  const scheme = url.protocol.slice(0, -1) as Scheme
  if (!pattern.schemes.includes(scheme)) return false

  const expectedHost = normalizeHost(pattern.host)
  const actualHost = url.hostname.toLowerCase()
  const hostMatches =
    actualHost === expectedHost ||
    (pattern.includeSubdomains && actualHost.endsWith(`.${expectedHost}`))

  return hostMatches && pathRegex(pattern.path).test(url.pathname)
}

export function findMatchingRule(rules: AccessRule[], url: string): AccessRule | undefined {
  let best: AccessRule | undefined
  for (const rule of rules) {
    if (!rule.enabled || !matchesTarget(rule.target, url)) continue
    if (!best || rule.priority < best.priority) best = rule
  }
  return best
}

function hostsMayOverlap(left: TargetPattern, right: TargetPattern): boolean {
  const a = normalizeHost(left.host)
  const b = normalizeHost(right.host)
  if (a === b) return true
  if (left.includeSubdomains && b.endsWith(`.${a}`)) return true
  return right.includeSubdomains && a.endsWith(`.${b}`)
}

function pathsMayOverlap(left: string, right: string): boolean {
  const a = normalizePath(left)
  const b = normalizePath(right)
  const aPrefix = a.split('*', 1)[0] ?? '/'
  const bPrefix = b.split('*', 1)[0] ?? '/'
  return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix)
}

export function patternsMayOverlap(left: TargetPattern, right: TargetPattern): boolean {
  const schemeOverlap = left.schemes.some((scheme) => right.schemes.includes(scheme))
  return (
    schemeOverlap &&
    hostsMayOverlap(left, right) &&
    pathsMayOverlap(left.path, right.path)
  )
}

export function targetToDnrRegex(pattern: TargetPattern): string {
  const scheme =
    pattern.schemes.length === 2
      ? 'https?'
      : escapeRegex(pattern.schemes[0] ?? 'https')
  const host = escapeRegex(normalizeHost(pattern.host))
  const hostExpression = pattern.includeSubdomains
    ? `(?:[^./]+\\.)*${host}`
    : host
  const path = escapeRegex(normalizePath(pattern.path)).replace(/\\\*/g, '.*')
  return `^${scheme}://${hostExpression}(?::[0-9]+)?${path}(?:[?].*)?$`
}

