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
    name: '测试规则',
    enabled: true,
    priority: 0,
    urlPatterns: ['https://example.com/*'],
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

  it('每周开放日只开启一次指定时长的放行窗口', () => {
    const now = new Date(2026, 7, 24, 12).getTime()
    const rule = baseRule({
      mode: 'schedule',
      schedule: { kind: 'weekly', weekdays: [new Date(now).getDay()] },
    })
    expect(evaluateRule(rule, {}, now).reason).toBe('calendar-open')
    const active = activateAccess(rule, {}, now)
    expect(evaluateRule(rule, active, now + 29 * MINUTE).state).toBe('allowed')
    expect(evaluateRule(rule, active, now + 30 * MINUTE).state).toBe('waiting')
  })

  it('允许时段外的访问进入等待并指向下一个开放时刻', () => {
    const morning = new Date(2026, 7, 24, 9).getTime()
    const evening = new Date(2026, 7, 24, 20).getTime()
    const rule = baseRule({ dailyWindow: { startMinutes: 12 * 60, endMinutes: 14 * 60 } })
    const before = evaluateRule(rule, {}, morning)
    expect(before.state).toBe('waiting')
    expect(before.reason).toBe('hours-closed')
    expect(before.nextChangeAt).toBe(new Date(2026, 7, 24, 12).getTime())
    const after = evaluateRule(rule, {}, evening)
    expect(after.reason).toBe('hours-closed')
    expect(after.nextChangeAt).toBe(new Date(2026, 7, 25, 12).getTime())
  })

  it('允许时段内正常发起挑战', () => {
    const noon = new Date(2026, 7, 24, 12).getTime()
    const rule = baseRule({ dailyWindow: { startMinutes: 12 * 60, endMinutes: 14 * 60 } })
    expect(evaluateRule(rule, {}, noon).state).toBe('challenge')
  })

  it('已开启的放行窗口不受时段结束影响', () => {
    const noon = new Date(2026, 7, 24, 12).getTime()
    const rule = baseRule({
      dailyWindow: { startMinutes: 12 * 60, endMinutes: 12 * 60 + 15 },
    })
    const active = activateAccess(rule, {}, noon)
    const pastClose = new Date(2026, 7, 24, 12, 20).getTime()
    expect(evaluateRule(rule, active, pastClose).state).toBe('allowed')
  })

  it('跨午夜时段在深夜与清晨都开放', () => {
    const rule = baseRule({ dailyWindow: { startMinutes: 22 * 60, endMinutes: 2 * 60 } })
    const lateNight = new Date(2026, 7, 24, 23).getTime()
    const earlyMorning = new Date(2026, 7, 25, 1).getTime()
    expect(evaluateRule(rule, {}, lateNight).state).toBe('challenge')
    expect(evaluateRule(rule, {}, earlyMorning).state).toBe('challenge')
    const afternoon = new Date(2026, 7, 24, 15).getTime()
    const waiting = evaluateRule(rule, {}, afternoon)
    expect(waiting.reason).toBe('hours-closed')
    expect(waiting.nextChangeAt).toBe(new Date(2026, 7, 24, 22).getTime())
  })

  it('开放日与允许时段共同决定闸门开启', () => {
    const morning = new Date(2026, 7, 24, 10).getTime()
    const rule = baseRule({
      mode: 'schedule',
      schedule: { kind: 'weekly', weekdays: [new Date(morning).getDay()] },
      dailyWindow: { startMinutes: 20 * 60, endMinutes: 23 * 60 },
    })
    expect(evaluateRule(rule, {}, morning).reason).toBe('hours-closed')
    const evening = new Date(2026, 7, 24, 21).getTime()
    expect(evaluateRule(rule, {}, evening).reason).toBe('calendar-open')
  })

  it('冷却结束后仍需等待开放时段', () => {
    const morning = new Date(2026, 7, 24, 9).getTime()
    const rule = baseRule({
      mode: 'schedule',
      schedule: { kind: 'interval', intervalDays: 1 },
      dailyWindow: { startMinutes: 20 * 60, endMinutes: 23 * 60 },
    })
    const runtime: RuntimeState = { lastWindowEndedAt: morning - 2 * DAY }
    expect(evaluateRule(rule, runtime, morning).reason).toBe('hours-closed')
    const evening = new Date(2026, 7, 24, 20, 30).getTime()
    expect(evaluateRule(rule, runtime, evening).reason).toBe('interval-ready')
  })

  it('组合日历验证后只在指定放行时长内允许访问', () => {
    const now = new Date(2026, 7, 24, 12).getTime()
    const rule = baseRule({
      mode: 'combined',
      schedule: { kind: 'weekly', weekdays: [new Date(now).getDay()] },
    })
    expect(evaluateRule(rule, {}, now).state).toBe('challenge')
    const verified = activateAccess(rule, {}, now)
    expect(verified.verifiedCalendarKey).toBe(localDateKey(now))
    expect(evaluateRule(rule, verified, now).state).toBe('allowed')
    expect(evaluateRule(rule, verified, now + 30 * MINUTE).state).toBe('waiting')
  })

  it('口令去除首尾空格并规范化 Unicode，但区分大小写', () => {
    expect(isAnswerCorrect('Café', '  Cafe\u0301  ')).toBe(true)
    expect(isAnswerCorrect('Secret', 'secret')).toBe(false)
  })
})
