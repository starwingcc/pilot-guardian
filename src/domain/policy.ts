import type { AccessRule, DailyWindow, PolicyEvaluation, RuntimeState, Schedule } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function localDateKey(now: number): string {
  const date = new Date(now)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function nextLocalMidnight(now: number): number {
  const date = new Date(now)
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime()
}

function isLastDayOfMonth(date: Date): boolean {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

export function isCalendarOpen(schedule: Schedule, now: number): boolean {
  const date = new Date(now)
  if (schedule.kind === 'weekly') return schedule.weekdays.includes(date.getDay())
  if (schedule.kind === 'monthly') {
    return schedule.monthDays.includes(date.getDate()) ||
      (schedule.includeLastDay && isLastDayOfMonth(date))
  }
  return false
}

function nextOpenDay(schedule: Schedule, now: number): number | undefined {
  if (schedule.kind === 'interval') return undefined
  const current = new Date(now)
  const midnight = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  )

  for (let offset = 1; offset <= 370; offset += 1) {
    const candidate = new Date(
      midnight.getFullYear(),
      midnight.getMonth(),
      midnight.getDate() + offset,
    )
    if (isCalendarOpen(schedule, candidate.getTime())) return candidate.getTime()
  }
  return undefined
}

export function isDailyWindowOpen(window: DailyWindow, now: number): boolean {
  const date = new Date(now)
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (window.startMinutes <= window.endMinutes) {
    return minutes >= window.startMinutes && minutes < window.endMinutes
  }
  return minutes >= window.startMinutes || minutes < window.endMinutes
}

function nextDailyWindowOpen(window: DailyWindow, now: number): number {
  const current = new Date(now)
  const minutes = current.getHours() * 60 + current.getMinutes()
  const nextDay =
    window.startMinutes <= window.endMinutes && minutes >= window.endMinutes ? 1 : 0
  return new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + nextDay,
    Math.floor(window.startMinutes / 60),
    window.startMinutes % 60,
  ).getTime()
}

function hoursClosedEvaluation(rule: AccessRule, now: number): PolicyEvaluation | undefined {
  if (!rule.dailyWindow || isDailyWindowOpen(rule.dailyWindow, now)) return undefined
  return {
    state: 'waiting',
    reason: 'hours-closed',
    nextChangeAt: nextDailyWindowOpen(rule.dailyWindow, now),
  }
}

export function settleRuntime(
  rule: AccessRule,
  runtime: RuntimeState,
  now: number,
): RuntimeState {
  if (!runtime.activeUntil || runtime.activeUntil > now) return runtime

  const settled: RuntimeState = { ...runtime }
  if (rule.schedule?.kind === 'interval') {
    settled.lastWindowEndedAt = runtime.activeUntil
  }
  delete settled.activeUntil
  return settled
}

function intervalEvaluation(
  rule: AccessRule,
  runtime: RuntimeState,
  now: number,
): PolicyEvaluation {
  const schedule = rule.schedule
  if (!schedule || schedule.kind !== 'interval') {
    return { state: 'challenge', reason: 'password-required' }
  }

  const readyAt = runtime.lastWindowEndedAt
    ? runtime.lastWindowEndedAt + schedule.intervalDays * DAY_MS
    : now
  if (readyAt > now) return { state: 'waiting', reason: 'cooldown', nextChangeAt: readyAt }
  if (rule.mode === 'combined') return { state: 'challenge', reason: 'password-required' }
  return { state: 'allowed', reason: 'interval-ready' }
}

function calendarEvaluation(
  rule: AccessRule,
  runtime: RuntimeState,
  now: number,
): PolicyEvaluation {
  const schedule = rule.schedule
  if (!schedule || schedule.kind === 'interval') {
    return { state: 'challenge', reason: 'password-required' }
  }

  if (!isCalendarOpen(schedule, now)) {
    const nextChangeAt = nextOpenDay(schedule, now)
    return nextChangeAt
      ? { state: 'waiting', reason: 'calendar-closed', nextChangeAt }
      : { state: 'waiting', reason: 'calendar-closed' }
  }

  const tomorrow = nextLocalMidnight(now)
  if (runtime.verifiedCalendarKey === localDateKey(now)) {
    const nextChangeAt = nextOpenDay(schedule, now)
    return nextChangeAt
      ? { state: 'waiting', reason: 'calendar-closed', nextChangeAt }
      : { state: 'waiting', reason: 'calendar-closed' }
  }
  if (rule.mode === 'schedule') {
    return { state: 'allowed', reason: 'calendar-open', nextChangeAt: tomorrow }
  }
  return { state: 'challenge', reason: 'password-required', nextChangeAt: tomorrow }
}

export function evaluateRule(
  rule: AccessRule,
  runtimeInput: RuntimeState,
  now: number,
): PolicyEvaluation {
  const runtime = settleRuntime(rule, runtimeInput, now)
  if (runtime.activeUntil && runtime.activeUntil > now) {
    return { state: 'allowed', reason: 'active-window', nextChangeAt: runtime.activeUntil }
  }
  const hoursClosed = hoursClosedEvaluation(rule, now)
  if (hoursClosed) return hoursClosed
  if (rule.mode === 'password') {
    return { state: 'challenge', reason: 'password-required' }
  }

  if (rule.schedule?.kind === 'interval') {
    return intervalEvaluation(rule, runtime, now)
  }
  return calendarEvaluation(rule, runtime, now)
}

export function activateAccess(
  rule: AccessRule,
  runtimeInput: RuntimeState,
  now: number,
): RuntimeState {
  const runtime = settleRuntime(rule, runtimeInput, now)
  if (rule.schedule && rule.schedule.kind !== 'interval') {
    return {
      ...runtime,
      activeUntil: now + rule.accessDurationMinutes * 60 * 1000,
      verifiedCalendarKey: localDateKey(now),
    }
  }
  return {
    ...runtime,
    activeUntil: now + rule.accessDurationMinutes * 60 * 1000,
  }
}

export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim()
}

export function isAnswerCorrect(expected: string, actual: string): boolean {
  return normalizeAnswer(expected) === normalizeAnswer(actual)
}

