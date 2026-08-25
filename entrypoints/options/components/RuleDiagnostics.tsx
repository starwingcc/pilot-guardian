import { CircleOffIcon, RouteIcon, ScanSearchIcon, ShieldCheckIcon } from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/src/components/ui/field'
import { Input } from '@/src/components/ui/input'
import { Separator } from '@/src/components/ui/separator'
import type { AccessRule } from '../../../src/domain/types'

interface RuleDiagnosticsProps {
  rule: AccessRule
  testUrl: string
  onTestUrlChange: (value: string) => void
  testMatch: AccessRule | undefined
}

export function RuleDiagnostics({ rule, testUrl, onTestUrlChange, testMatch }: RuleDiagnosticsProps) {
  const selectedRuleMatches = testMatch?.id === rule.id
  const result = selectedRuleMatches
    ? {
        label: '当前规则生效',
        detail: '该地址会由正在编辑的规则接管。',
        icon: ShieldCheckIcon,
        badge: 'MATCHED',
      }
    : testMatch
      ? {
          label: testMatch.name,
          detail: '该地址会被其他优先级更高的规则接管。',
          icon: RouteIcon,
          badge: 'OVERRIDDEN',
        }
      : {
          label: '当前没有规则命中',
          detail: '该地址将按正常浏览流程继续访问。',
          icon: CircleOffIcon,
          badge: 'CLEAR',
        }
  const ResultIcon = result.icon

  return (
    <div className="diagnostics-stack">
      <Card className="diagnostics-card">
        <CardHeader>
          <div>
            <CardDescription>ROUTE DIAGNOSTICS</CardDescription>
            <CardTitle>规则诊断</CardTitle>
          </div>
          <Badge variant="outline"><ScanSearchIcon data-icon="inline-start" />实时计算</Badge>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="test-url">测试完整 URL</FieldLabel>
              <Input
                id="test-url"
                value={testUrl}
                placeholder="https://www.example.com/path"
                onChange={(event) => onTestUrlChange(event.target.value)}
              />
              <FieldDescription>按照左侧规则顺序和启用状态计算实际结果。</FieldDescription>
            </Field>
          </FieldGroup>

          <Separator />

          <section className="diagnostics-result" aria-live="polite">
            <div className="diagnostics-result__icon"><ResultIcon aria-hidden="true" /></div>
            <div className="diagnostics-result__copy">
              <Badge variant={selectedRuleMatches ? 'default' : 'secondary'}>{result.badge}</Badge>
              <strong>{result.label}</strong>
              <p>{result.detail}</p>
            </div>
          </section>

          <Separator />

          <dl className="diagnostics-facts">
            <div>
              <dt>当前规则</dt>
              <dd>{rule.name || '未命名规则'}</dd>
            </div>
            <div>
              <dt>优先级</dt>
              <dd>{String(rule.priority + 1).padStart(2, '0')}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{rule.enabled ? '已启用' : '已停用'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
