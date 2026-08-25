import {
  ArrowDownIcon,
  ArrowUpIcon,
  Clock3Icon,
  KeyRoundIcon,
  PlusIcon,
  RadarIcon,
  RouteIcon,
  Settings2Icon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Checkbox } from '@/src/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/src/components/ui/field'
import { Input } from '@/src/components/ui/input'
import { Separator } from '@/src/components/ui/separator'
import { Switch } from '@/src/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/src/components/ui/toggle-group'
import type { AccessRule, RuleMode, Schedule, Scheme } from '../../../src/domain/types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function defaultSchedule(kind: Schedule['kind']): Schedule {
  if (kind === 'interval') return { kind, intervalDays: 3 }
  if (kind === 'weekly') return { kind, weekdays: [6] }
  return { kind, monthDays: [1], includeLastDay: false }
}

interface RuleEditorProps {
  rule: AccessRule
  index: number
  total: number
  hasConflict: boolean
  onUpdate: (mutate: (draft: AccessRule) => void) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}

export function RuleEditor({ rule, index, total, hasConflict, onUpdate, onMove, onDelete }: RuleEditorProps) {
  const setMode = (mode: string) => {
    if (!mode) return
    onUpdate((draft) => {
      draft.mode = mode as RuleMode
      if (draft.mode !== 'password' && !draft.schedule) draft.schedule = defaultSchedule('interval')
      if (draft.mode !== 'schedule' && draft.challenges.length === 0) {
        draft.challenges = [{ id: crypto.randomUUID(), answer: '' }]
      }
    })
  }

  return (
    <div className="editor-stack">
      <div className="editor-heading">
        <div>
          <span className="kicker">PRIORITY / {String(index + 1).padStart(2, '0')}</span>
          <h2>{rule.name || '未命名规则'}</h2>
        </div>
        <div className="editor-actions">
          <Button variant="outline" size="icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="上移规则"><ArrowUpIcon /></Button>
          <Button variant="outline" size="icon" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="下移规则"><ArrowDownIcon /></Button>
          <Button variant="destructive" size="icon" onClick={onDelete} aria-label="删除规则"><Trash2Icon /></Button>
        </div>
      </div>

      {hasConflict ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>检测到航线重叠</AlertTitle>
          <AlertDescription>多个规则可能命中相同地址，系统将采用优先级最高的一条。</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="card-heading-icon"><Settings2Icon aria-hidden="true" /></div>
          <div><CardTitle>基本信息</CardTitle><CardDescription>定义航线名称及部署状态。</CardDescription></div>
          <Badge variant={rule.enabled ? 'default' : 'outline'}>{rule.enabled ? '正在执行' : '已停用'}</Badge>
        </CardHeader>
        <CardContent>
          <FieldGroup className="form-columns">
            <Field data-invalid={!rule.name.trim()}>
              <FieldLabel htmlFor={`rule-name-${rule.id}`}>规则名称</FieldLabel>
              <Input id={`rule-name-${rule.id}`} value={rule.name} aria-invalid={!rule.name.trim()} onChange={(event) => onUpdate((draft) => { draft.name = event.target.value })} />
              <FieldDescription>这个名称将显示在拦截闸门中。</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <div><FieldTitle>启用此规则</FieldTitle><FieldDescription>立即参与浏览器导航匹配。</FieldDescription></div>
              <Switch checked={rule.enabled} onCheckedChange={(checked) => onUpdate((draft) => { draft.enabled = checked })} aria-label="启用此规则" />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="card-heading-icon"><RouteIcon aria-hidden="true" /></div>
          <div><CardTitle>受控目标</CardTitle><CardDescription>指定需要被闸门接管的网址范围。</CardDescription></div>
        </CardHeader>
        <CardContent>
          <FieldGroup className="target-columns">
            <FieldSet>
              <FieldLegend variant="label">协议</FieldLegend>
              <ToggleGroup
                type="multiple"
                value={rule.target.schemes}
                onValueChange={(value) => onUpdate((draft) => { draft.target.schemes = value as Scheme[] })}
                variant="outline"
                spacing={2}
              >
                <ToggleGroupItem value="https">HTTPS</ToggleGroupItem>
                <ToggleGroupItem value="http">HTTP</ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>
            <Field data-invalid={!rule.target.host.trim()}>
              <FieldLabel htmlFor={`host-${rule.id}`}>主机名</FieldLabel>
              <Input id={`host-${rule.id}`} value={rule.target.host} placeholder="www.example.com" aria-invalid={!rule.target.host.trim()} onChange={(event) => onUpdate((draft) => { draft.target.host = event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`path-${rule.id}`}>路径</FieldLabel>
              <Input id={`path-${rule.id}`} value={rule.target.path} placeholder="/*" onChange={(event) => onUpdate((draft) => { draft.target.path = event.target.value })} />
            </Field>
            <Field orientation="horizontal" className="span-full">
              <div><FieldTitle>包含所有子域名</FieldTitle><FieldDescription>例如 news.example.com 也会命中。</FieldDescription></div>
              <Switch checked={rule.target.includeSubdomains} onCheckedChange={(checked) => onUpdate((draft) => { draft.target.includeSubdomains = checked })} aria-label="包含所有子域名" />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="card-heading-icon"><RadarIcon aria-hidden="true" /></div>
          <div><CardTitle>访问策略</CardTitle><CardDescription>组合身份挑战与时间窗口。</CardDescription></div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldTitle id={`mode-${rule.id}`}>策略模式</FieldTitle>
              <ToggleGroup type="single" value={rule.mode} onValueChange={setMode} variant="outline" spacing={2} aria-labelledby={`mode-${rule.id}`}>
                <ToggleGroupItem value="password"><KeyRoundIcon data-icon="inline-start" />口令</ToggleGroupItem>
                <ToggleGroupItem value="schedule"><Clock3Icon data-icon="inline-start" />周期</ToggleGroupItem>
                <ToggleGroupItem value="combined"><ShieldCheckIcon data-icon="inline-start" />口令 + 周期</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            {(rule.mode === 'password' || rule.schedule?.kind === 'interval') ? (
              <Field>
                <FieldLabel htmlFor={`duration-${rule.id}`}>放行时长（分钟）</FieldLabel>
                <Input id={`duration-${rule.id}`} type="number" min="1" max="10080" value={rule.accessDurationMinutes} onChange={(event) => onUpdate((draft) => { draft.accessDurationMinutes = Number(event.target.value) })} />
                <FieldDescription>验证成功后，在此时长内不再重复拦截。</FieldDescription>
              </Field>
            ) : null}
            {rule.mode !== 'password' && rule.schedule ? <ScheduleEditor rule={rule} onUpdate={onUpdate} /> : null}
          </FieldGroup>
        </CardContent>
      </Card>

      {rule.mode !== 'schedule' ? <ChallengeEditor rule={rule} onUpdate={onUpdate} /> : null}
    </div>
  )
}

function ScheduleEditor({ rule, onUpdate }: Pick<RuleEditorProps, 'rule' | 'onUpdate'>) {
  const schedule = rule.schedule
  if (!schedule) return null
  return (
    <div className="schedule-console">
      <Field>
        <FieldTitle id={`schedule-${rule.id}`}>周期类型</FieldTitle>
        <ToggleGroup
          type="single"
          value={schedule.kind}
          onValueChange={(kind) => { if (kind) onUpdate((draft) => { draft.schedule = defaultSchedule(kind as Schedule['kind']) }) }}
          variant="outline"
          spacing={2}
          aria-labelledby={`schedule-${rule.id}`}
        >
          <ToggleGroupItem value="interval">间隔天数</ToggleGroupItem>
          <ToggleGroupItem value="weekly">每周开放日</ToggleGroupItem>
          <ToggleGroupItem value="monthly">每月开放日</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {schedule.kind === 'interval' ? (
        <Field>
          <FieldLabel htmlFor={`interval-${rule.id}`}>冷却天数</FieldLabel>
          <Input id={`interval-${rule.id}`} type="number" min="0.01" step="0.25" value={schedule.intervalDays} onChange={(event) => onUpdate((draft) => {
            if (draft.schedule?.kind === 'interval') draft.schedule.intervalDays = Number(event.target.value)
          })} />
          <FieldDescription>一天按连续 24 小时计算。</FieldDescription>
        </Field>
      ) : null}
      {schedule.kind === 'weekly' ? (
        <FieldSet>
          <FieldLegend variant="label">选择星期</FieldLegend>
          <ToggleGroup type="multiple" value={schedule.weekdays.map(String)} onValueChange={(values) => onUpdate((draft) => {
            if (draft.schedule?.kind === 'weekly') draft.schedule.weekdays = values.map(Number).sort((a, b) => a - b)
          })} variant="outline" spacing={2}>
            {WEEKDAYS.map((day, index) => <ToggleGroupItem key={day} value={String(index)}>周{day}</ToggleGroupItem>)}
          </ToggleGroup>
        </FieldSet>
      ) : null}
      {schedule.kind === 'monthly' ? (
        <FieldSet>
          <FieldLegend variant="label">选择日期</FieldLegend>
          <ToggleGroup className="month-toggle-grid" type="multiple" value={schedule.monthDays.map(String)} onValueChange={(values) => onUpdate((draft) => {
            if (draft.schedule?.kind === 'monthly') draft.schedule.monthDays = values.map(Number).sort((a, b) => a - b)
          })} variant="outline" spacing={2}>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <ToggleGroupItem key={day} value={String(day)}>{day}</ToggleGroupItem>)}
          </ToggleGroup>
          <Field orientation="horizontal">
            <Checkbox id={`last-day-${rule.id}`} checked={schedule.includeLastDay} onCheckedChange={(checked) => onUpdate((draft) => {
              if (draft.schedule?.kind === 'monthly') draft.schedule.includeLastDay = checked === true
            })} />
            <FieldLabel htmlFor={`last-day-${rule.id}`}>同时包含每月最后一天</FieldLabel>
          </Field>
        </FieldSet>
      ) : null}
    </div>
  )
}

function ChallengeEditor({ rule, onUpdate }: Pick<RuleEditorProps, 'rule' | 'onUpdate'>) {
  return (
    <Card>
      <CardHeader>
        <div className="card-heading-icon"><KeyRoundIcon aria-hidden="true" /></div>
        <div><CardTitle>挑战序列</CardTitle><CardDescription>访客必须依次完成全部步骤。</CardDescription></div>
        <Badge variant="outline">{rule.challenges.length} STEPS</Badge>
      </CardHeader>
      <CardContent>
        <div className="challenge-stack">
          {rule.challenges.map((challenge, index) => (
            <div className="challenge-unit" key={challenge.id}>
              <div className="challenge-number">{String(index + 1).padStart(2, '0')}</div>
              <FieldGroup>
                <Field data-invalid={!challenge.answer}>
                  <FieldLabel htmlFor={`answer-${challenge.id}`}>口令</FieldLabel>
                  <Input id={`answer-${challenge.id}`} type="text" inputMode="text" value={challenge.answer} aria-invalid={!challenge.answer} autoComplete="off" spellCheck={false} onChange={(event) => onUpdate((draft) => { if (draft.challenges[index]) draft.challenges[index].answer = event.target.value })} />
                  <FieldDescription>仅在此设备本地明文保存。</FieldDescription>
                </Field>
              </FieldGroup>
              <div className="challenge-actions">
                <Button variant="ghost" size="icon" onClick={() => onUpdate((draft) => {
                  if (index < 1) return
                  const previous = draft.challenges[index - 1]
                  const current = draft.challenges[index]
                  if (previous && current) [draft.challenges[index - 1], draft.challenges[index]] = [current, previous]
                })} disabled={index === 0} aria-label={`上移第 ${index + 1} 道口令`}><ArrowUpIcon /></Button>
                <Button variant="ghost" size="icon" onClick={() => onUpdate((draft) => {
                  if (index >= draft.challenges.length - 1) return
                  const next = draft.challenges[index + 1]
                  const current = draft.challenges[index]
                  if (next && current) [draft.challenges[index], draft.challenges[index + 1]] = [next, current]
                })} disabled={index === rule.challenges.length - 1} aria-label={`下移第 ${index + 1} 道口令`}><ArrowDownIcon /></Button>
                <Button variant="destructive" size="icon" disabled={rule.challenges.length === 1} onClick={() => onUpdate((draft) => { draft.challenges.splice(index, 1) })} aria-label={`删除第 ${index + 1} 道口令`}><Trash2Icon /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={() => onUpdate((draft) => { draft.challenges.push({ id: crypto.randomUUID(), answer: '' }) })}>
          <PlusIcon data-icon="inline-start" />添加挑战步骤
        </Button>
      </CardFooter>
      <Separator />
    </Card>
  )
}
