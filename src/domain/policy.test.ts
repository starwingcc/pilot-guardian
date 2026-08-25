import { describe, expect, it } from 'vitest'
import type { AccessRule, RuntimeState, Schedule } from './types'
import {
  activateAccess,
  evaluateRule,
  isAnswerCorrect,
  isCalendarOpen,
  localDateKey,
  settleRuntime,
} from './policy'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function baseRule(overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id: 'rule',
    dnrRuleId: 1,
    name: '测试规则',
    enabled: true,
    priority: 0,
    target: { schemes: ['https'], host: 'example.com', includeSubdomains: false, path: '/*' },
    mode: 'password',
    challenges: [{ id: 'step', type: 'text', answer: 'Secret', scene: { kind: 'default' } }],
    accessDurationMinutes: 30,
    ...overrides,
  }
}

describe('访问策略', () => {
  it('口令模式在放行截止前允许访问，截止后恢复挑战', () => {
    const rule = baseRule()
    expect(evaluateRule(rule, {}, 1_000).state).toBe('challenge')
    const active = activateAccess(rule, {}, 1_000)
    expect(evaluateRule(rule, active, 1_000 + 29 * MINUTE).state).toBe('allowed')
    expect(evaluateRule(rule, active, 1_000 + 30 * MINUTE).state).toBe('challenge')
  })

  it('间隔模式首次立即开放，窗口结束后从结束时刻开始冷却', () => {
    const rule = baseRule({
      mode: 'schedule',
      schedule: { kind: 'interval', intervalDays: 3 },
    })
    expect(evaluateRule(rule, {}, 10_000).reason).toBe('interval-ready')
    const active = activateAccess(rule, {}, 10_000)
    const endedAt = active.activeUntil!
    const settled = settleRuntime(rule, active, endedAt)
    expect(settled.lastWindowEndedAt).toBe(endedAt)
    expect(evaluateRule(rule, settled, endedAt + 3 * DAY - 1).state).toBe('waiting')
    expect(evaluateRule(rule, settled, endedAt + 3 * DAY).reason).toBe('interval-ready')
  })

  it('组合间隔在冷却结束后要求口令', () => {
    const rule = baseRule({
      mode: 'combined',
      schedule: { kind: 'interval', intervalDays: 1 },
    })
    expect(evaluateRule(rule, {}, 10_000).state).toBe('challenge')
    const runtime: RuntimeState = { lastWindowEndedAt: 10_000 }
    expect(evaluateRule(rule, runtime, 10_000 + DAY - 1).state).toBe('waiting')
    expect(evaluateRule(rule, runtime, 10_000 + DAY).state).toBe('challenge')
  })

  it('每周策略支持多个开放日', () => {
    const timestamp = new Date(2026, 7, 24, 12).getTime()
    const weekday = new Date(timestamp).getDay()
    const schedule: Schedule = { kind: 'weekly', weekdays: [weekday, (weekday + 2) % 7] }
    expect(isCalendarOpen(schedule, timestamp)).toBe(true)
    expect(isCalendarOpen(schedule, timestamp + DAY)).toBe(false)
  })

  it('每月 31 日在二月跳过，最后一天选项独立生效', () => {
    const februaryEnd = new Date(2025, 1, 28, 12).getTime()
    expect(isCalendarOpen({ kind: 'monthly', monthDays: [31], includeLastDay: false }, februaryEnd)).toBe(false)
    expect(isCalendarOpen({ kind: 'monthly', monthDays: [31], includeLastDay: true }, februaryEnd)).toBe(true)
  })

  it('组合日历只认可同一个本地自然日的验证', () => {
    const now = new Date(2026, 7, 24, 12).getTime()
    const rule = baseRule({
      mode: 'combined',
      schedule: { kind: 'weekly', weekdays: [new Date(now).getDay()] },
    })
    expect(evaluateRule(rule, {}, now).state).toBe('challenge')
    const verified = activateAccess(rule, {}, now)
    expect(verified.verifiedCalendarKey).toBe(localDateKey(now))
    expect(evaluateRule(rule, verified, now).state).toBe('allowed')
  })

  it('口令去除首尾空格并规范化 Unicode，但区分大小写', () => {
    expect(isAnswerCorrect('Café', '  Cafe\u0301  ')).toBe(true)
    expect(isAnswerCorrect('Secret', 'secret')).toBe(false)
  })
})
