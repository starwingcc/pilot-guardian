import { useEffect, useState } from 'react'
import {
  ArrowUpRightIcon,
  Clock3Icon,
  KeyRoundIcon,
  RadioTowerIcon,
  RouteIcon,
  ShieldCheckIcon,
  ShieldIcon,
} from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Skeleton } from '@/src/components/ui/skeleton'
import { cn } from '@/src/lib/utils'
import type { RuleStatus } from '../../src/runtime/messages'
import { sendRuntimeMessage } from '../../src/ui/runtime-client'
import { formatDateTime, formatRemaining } from '../../src/ui/time'

function statusCopy(
  status: RuleStatus,
  now: number,
): { title: string; detail: string; state: string } {
  if (!status.rule || !status.evaluation) {
    return { title: '当前页面未受控', detail: '没有启用的访问规则匹配这个地址。', state: 'STANDBY' }
  }
  const evaluation = status.evaluation
  if (evaluation.state === 'allowed') {
    return {
      title: `${status.rule.name} · 已放行`,
      detail: evaluation.nextChangeAt
        ? `剩余 ${formatRemaining(evaluation.nextChangeAt, now)}`
        : '当前处于允许访问状态。',
      state: 'CLEARED',
    }
  }
  if (evaluation.state === 'challenge') {
    return {
      title: `${status.rule.name} · 等待挑战`,
      detail: '下次访问会显示闸门挑战。',
      state: 'VERIFY',
    }
  }
  return {
    title: `${status.rule.name} · 等待开放`,
    detail: evaluation.nextChangeAt
      ? `下一次开放：${formatDateTime(evaluation.nextChangeAt)}`
      : '当前周期不允许访问。',
    state: 'HOLD',
  }
}

export function PopupApp() {
  const [status, setStatus] = useState<RuleStatus>({ now: Date.now() })
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!tab?.url) return
        const gatePrefix = chrome.runtime.getURL('/gate.html')
        const ruleId = tab.url.startsWith(gatePrefix)
          ? (new URL(tab.url).searchParams.get('ruleId') ?? undefined)
          : undefined
        return sendRuntimeMessage<RuleStatus>({
          type: 'status:get',
          url: tab.url,
          ...(ruleId ? { ruleId } : {}),
        }).then(setStatus)
      })
      .finally(() => setLoading(false))
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const copy = statusCopy(status, now)
  const state = status.evaluation?.state
  const Icon =
    state === 'allowed'
      ? ShieldCheckIcon
      : state === 'challenge'
        ? KeyRoundIcon
        : state === 'waiting'
          ? Clock3Icon
          : RadioTowerIcon

  return (
    <main className="popup-shell">
      <div className="popup-grid" aria-hidden="true" />
      <header className="popup-header">
        <div className="popup-brand">
          <ShieldIcon aria-hidden="true" />
          <span>PILOT GUARDIAN</span>
        </div>
        <Badge variant="outline">NODE 01</Badge>
      </header>

      <Card className="status-card">
        <CardHeader>
          <div className={cn('status-orb', `status-orb--${state ?? 'idle'}`)}>
            <Icon aria-hidden="true" />
          </div>
          <CardDescription>CURRENT ROUTE STATUS</CardDescription>
          {loading ? <Skeleton className="h-7 w-4/5" /> : <CardTitle>{copy.title}</CardTitle>}
        </CardHeader>
        <CardContent>
          {loading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : (
            <p>{copy.detail}</p>
          )}
          <div className="popup-telemetry">
            <span>
              <RouteIcon aria-hidden="true" />
              MODE
            </span>
            <strong>{copy.state}</strong>
          </div>
        </CardContent>
      </Card>

      <Button size="lg" onClick={() => void chrome.runtime.openOptionsPage()}>
        打开访问规则设置
        <ArrowUpRightIcon data-icon="inline-end" />
      </Button>
      <p className="popup-note">快速绕过已禁用。如需暂停规则，请进入完整控制台。</p>
    </main>
  )
}
