import { KeyRoundIcon, RadarIcon, RouteIcon, ScanLineIcon } from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/src/components/ui/field'
import { Input } from '@/src/components/ui/input'
import { Progress } from '@/src/components/ui/progress'
import { Separator } from '@/src/components/ui/separator'
import type { AccessRule } from '../../../src/domain/types'

interface MissionPreviewProps {
  rule: AccessRule
  testUrl: string
  onTestUrlChange: (value: string) => void
  testMatch: AccessRule | undefined
}

export function MissionPreview({ rule, testUrl, onTestUrlChange, testMatch }: MissionPreviewProps) {
  const prompt = rule.mode === 'schedule'
    ? '当前周期尚未开放，请保持航向。'
    : rule.challenges[0]?.prompt || '请输入口令'
  const progress = rule.mode === 'schedule' ? 42 : Math.max(18, 100 / Math.max(rule.challenges.length, 1))

  return (
    <div className="preview-stack">
      <Card className="preview-card">
        <CardHeader>
          <div className="preview-title-row">
            <div>
              <CardDescription>LIVE GATE / 01</CardDescription>
              <CardTitle>闸门实时预览</CardTitle>
            </div>
            <Badge><ScanLineIcon data-icon="inline-start" />实时</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mini-gate">
            <svg className="mini-orbit" viewBox="0 0 320 320" aria-hidden="true">
              <circle cx="160" cy="160" r="112" />
              <circle cx="160" cy="160" r="74" />
              <path d="M28 186C92 54 210 32 294 142" />
              <path d="M46 226C152 294 256 246 284 162" />
              <circle className="orbit-node" cx="282" cy="145" r="5" />
            </svg>
            <div className="mini-gate-head">
              <span>PILOT GUARDIAN</span>
              <RadarIcon aria-hidden="true" />
            </div>
            <div className="mini-gate-copy">
              <small>受控航线</small>
              <strong>{rule.name || '未命名规则'}</strong>
              <p>{prompt}</p>
            </div>
            <div className="preview-console">
              <KeyRoundIcon aria-hidden="true" />
              <span>{rule.mode === 'schedule' ? '周期锁定' : `${rule.challenges.length} 道验证序列`}</span>
            </div>
            <Progress value={progress} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>ROUTE DIAGNOSTICS</CardDescription>
          <CardTitle>匹配测试</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="test-url">输入完整 URL</FieldLabel>
              <Input id="test-url" value={testUrl} onChange={(event) => onTestUrlChange(event.target.value)} />
              <FieldDescription>测试按左侧优先级顺序执行。</FieldDescription>
            </Field>
          </FieldGroup>
          <Separator />
          <div className="match-result">
            <RouteIcon aria-hidden="true" />
            <div>
              <small>实际生效</small>
              <strong>{testMatch?.name ?? '当前没有规则命中'}</strong>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
