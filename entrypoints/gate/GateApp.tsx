import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRightIcon,
  CircleAlertIcon,
  Clock3Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/src/components/ui/field'
import { Progress } from '@/src/components/ui/progress'
import { Skeleton } from '@/src/components/ui/skeleton'
import { Spinner } from '@/src/components/ui/spinner'
import { PasswordInput } from '@/src/components/password-input'
import type { GateContext, GateSubmitResponse } from '../../src/runtime/messages'
import { sendRuntimeMessage } from '../../src/ui/runtime-client'
import { formatDateTime, formatRemaining } from '../../src/ui/time'

function useClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function reasonText(context: GateContext, now: number): string {
  const { evaluation } = context
  if (evaluation.reason === 'cooldown' && evaluation.nextChangeAt) {
    return `距离下一次可访问还有 ${formatRemaining(evaluation.nextChangeAt, now)}`
  }
  if (evaluation.reason === 'calendar-closed' && evaluation.nextChangeAt) {
    return `下一次开放：${formatDateTime(evaluation.nextChangeAt)}`
  }
  if (evaluation.state === 'allowed') return '航线已放行，正在继续访问。'
  return '完成挑战后，本次航线才会放行。'
}

function FlightPath() {
  return (
    <svg className="flight-map" viewBox="0 0 1100 760" aria-hidden="true">
      <defs>
        <linearGradient id="route-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
          <stop offset="0.45" stopColor="var(--primary)" stopOpacity="0.85" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <circle cx="760" cy="330" r="252" />
      <circle cx="760" cy="330" r="176" />
      <circle cx="760" cy="330" r="94" />
      <path className="route-line" d="M50 605C250 340 425 575 610 334S905 100 1070 210" />
      <path className="route-ghost" d="M-30 380C240 192 404 215 590 397S908 640 1130 470" />
      <circle className="route-node" cx="610" cy="334" r="8" />
      <circle className="route-pulse" cx="610" cy="334" r="19" />
    </svg>
  )
}

export function GateApp() {
  const ruleId = new URLSearchParams(location.search).get('ruleId') ?? ''
  const [context, setContext] = useState<GateContext>()
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorPulse, setErrorPulse] = useState(0)
  const reduceMotion = useReducedMotion()
  const now = useClock()

  const loadContext = useCallback(async () => {
    if (!ruleId) {
      setError('闸门地址缺少规则标识')
      setLoading(false)
      return
    }
    try {
      const next = await sendRuntimeMessage<GateContext>({ type: 'gate:get-context', ruleId })
      setContext(next)
      setError('')
      if (next.evaluation.state === 'allowed' && next.originalUrl) location.replace(next.originalUrl)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取访问规则')
    } finally {
      setLoading(false)
    }
  }, [ruleId])

  useEffect(() => { void loadContext() }, [loadContext])

  useEffect(() => {
    const boundary = context?.evaluation.nextChangeAt
    if (!boundary || now < boundary) return
    void loadContext()
  }, [context?.evaluation.nextChangeAt, loadContext, now])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!context || submitting) return
    setSubmitting(true)
    try {
      const result = await sendRuntimeMessage<GateSubmitResponse>({
        type: 'gate:submit',
        ruleId,
        stepIndex: context.stepIndex,
        answer,
      })
      if (!result.ok) {
        setError(result.error)
        setErrorPulse((value) => value + 1)
        return
      }
      setError('')
      setAnswer('')
      if (result.complete) {
        if (result.redirectUrl) location.replace(result.redirectUrl)
        else await loadContext()
        return
      }
      setContext((previous) => previous ? { ...previous, stepIndex: result.nextStepIndex } : previous)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '口令校验失败')
      setErrorPulse((value) => value + 1)
    } finally {
      setSubmitting(false)
    }
  }

  const step = context?.rule.challenges[context.stepIndex]
  const totalSteps = context?.rule.challenges.length ?? 0
  const stepProgress = totalSteps > 0 ? ((context?.stepIndex ?? 0) / totalSteps) * 100 : 0
  const waiting = context?.evaluation.state === 'waiting'

  return (
    <main className="gate-scene">
      <div className="gate-noise" aria-hidden="true" />
      <FlightPath />
      <header className="gate-nav">
        <div className="gate-brand"><ShieldCheckIcon aria-hidden="true" /><span>PILOT GUARDIAN</span></div>
        <div className="gate-coordinates"><span>SECURE ROUTE</span><span>NODE / 01</span></div>
      </header>

      <motion.div
        className="gate-layout"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <section className="gate-editorial">
          <Badge variant="outline"><RadioTowerIcon data-icon="inline-start" />访问已受控</Badge>
          <p className="gate-kicker">INTERCEPTED NAVIGATION</p>
          {loading ? (
            <div className="gate-title-skeleton"><Skeleton /><Skeleton /></div>
          ) : (
            <h1>{context?.rule.name ?? '航线不可用'}</h1>
          )}
          <p className="gate-lead">{context ? reasonText(context, now) : '正在建立安全链路并读取访问策略。'}</p>
          <div className="gate-metrics">
            <div><small>PROTOCOL</small><strong>LOCAL</strong></div>
            <div><small>SEQUENCE</small><strong>{String(totalSteps).padStart(2, '0')}</strong></div>
            <div><small>STATUS</small><strong>{waiting ? 'HOLD' : 'VERIFY'}</strong></div>
          </div>
        </section>

        <section className="gate-terminal" aria-label="访问验证">
          <div className="terminal-beacon" aria-hidden="true"><span /></div>
          {loading ? (
            <Card>
              <CardHeader><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-3/4" /></CardHeader>
              <CardContent><Skeleton className="h-10 w-full" /><Skeleton className="mt-4 h-9 w-32" /></CardContent>
            </Card>
          ) : context ? (
            <AnimatePresence mode="wait">
              {context.evaluation.state === 'challenge' && step ? (
                <motion.div
                  key={step.id}
                  initial={reduceMotion ? false : { opacity: 0, x: 36, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -24, filter: 'blur(5px)' }}
                  transition={{ duration: 0.38 }}
                >
                  <Card className="challenge-card">
                    <CardHeader>
                      <CardDescription>CHALLENGE {String(context.stepIndex + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}</CardDescription>
                      <CardTitle>{step.prompt}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={submit}>
                        <FieldGroup>
                          <Field data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="answer">{step.prompt}</FieldLabel>
                            <PasswordInput
                              id="answer"
                              value={answer}
                              aria-invalid={Boolean(error)}
                              onChange={(event) => setAnswer(event.target.value)}
                              autoComplete="off"
                              autoFocus
                            />
                            <FieldDescription>口令只在当前设备中校验。</FieldDescription>
                          </Field>
                          <Button type="submit" size="lg" disabled={!answer || submitting}>
                            {submitting ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}
                            {submitting ? '正在校验' : '确认口令'}
                            {!submitting ? <ArrowRightIcon data-icon="inline-end" /> : null}
                          </Button>
                        </FieldGroup>
                      </form>
                    </CardContent>
                  </Card>
                  <div className="terminal-progress">
                    <span>SEQUENCE PROGRESS</span><span>{Math.round(stepProgress)}%</span>
                    <Progress value={stepProgress} />
                  </div>
                </motion.div>
              ) : (
                <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="waiting-card">
                    <CardHeader>
                      <div className="radar-core" aria-hidden="true"><Clock3Icon /><span /></div>
                      <CardDescription>CALENDAR HOLD</CardDescription>
                      <CardTitle>保持航向，等待开放</CardTitle>
                    </CardHeader>
                    <CardContent><p>{reasonText(context, now)}</p></CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <Card><CardHeader><CardTitle>无法建立闸门</CardTitle></CardHeader><CardContent><p>请返回扩展配置页检查规则。</p></CardContent></Card>
          )}

          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key={errorPulse}
                initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: [0, -5, 5, 0] }}
                exit={{ opacity: 0 }}
              >
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>验证未通过</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      </motion.div>

      <footer className="gate-footer">
        <span>ENCRYPTED LOCAL CONTROL</span>
        <span><i className="signal-rotor"><LoaderCircleIcon aria-hidden="true" /></i> SIGNAL LOCKED</span>
      </footer>
    </main>
  )
}
