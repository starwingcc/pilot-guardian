import { useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BracesIcon,
  Clock3Icon,
  CopyIcon,
  KeyRoundIcon,
  MousePointerClickIcon,
  PlayIcon,
  PlusIcon,
  RadarIcon,
  RouteIcon,
  Settings2Icon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TypeIcon,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/src/components/ui/alert-dialog'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { Separator } from '@/src/components/ui/separator'
import { Switch } from '@/src/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/src/components/ui/toggle-group'
import { ChallengeDocumentEditor } from '@/src/components/challenge/ChallengeDocumentEditor'
import { SandboxPreviewPanel } from '@/src/components/challenge/SandboxPreviewPanel'
import { OFFICIAL_TEMPLATES, renderOfficialTemplate } from '../../../src/domain/challenge-templates'
import { hasUnreviewedDocuments } from '../../../src/domain/custom-documents'
import {
  DEFAULT_CUSTOM_DOCUMENT,
  DEFAULT_INTERACTIVE_DOCUMENT,
  createChallenge,
  createTextChallenge,
  defaultTemplateSource,
} from '../../../src/domain/defaults'
import type {
  AccessRule,
  ChallengeStep,
  InteractiveChallengeStep,
  OfficialTemplateSource,
  RuleMode,
  Schedule,
  Scheme,
  TextChallengeStep,
} from '../../../src/domain/types'

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
  const hasPendingReview = hasUnreviewedDocuments(rule)
  const setMode = (mode: string) => {
    if (!mode) return
    onUpdate((draft) => {
      draft.mode = mode as RuleMode
      if (draft.mode !== 'password' && !draft.schedule) draft.schedule = defaultSchedule('interval')
      if (draft.mode !== 'schedule' && draft.challenges.length === 0) {
        draft.challenges = [createTextChallenge()]
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
              <div>
                <FieldTitle>启用此规则</FieldTitle>
                <FieldDescription>{hasPendingReview ? '先成功预览全部自定义文档，再启用规则。' : '立即参与浏览器导航匹配。'}</FieldDescription>
              </div>
              <Switch
                checked={rule.enabled}
                disabled={!rule.enabled && hasPendingReview}
                onCheckedChange={(checked) => onUpdate((draft) => { draft.enabled = checked })}
                aria-label="启用此规则"
              />
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

function TextStepEditor({
  step,
  onChange,
}: {
  step: TextChallengeStep
  onChange: (mutate: (step: TextChallengeStep) => void) => void
}) {
  return (
    <FieldGroup>
      <Field data-invalid={!step.answer}>
        <FieldLabel htmlFor={`answer-${step.id}`}>文本答案</FieldLabel>
        <Input
          id={`answer-${step.id}`}
          type="text"
          inputMode="text"
          value={step.answer}
          aria-invalid={!step.answer}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange((draft) => { draft.answer = event.target.value })}
        />
        <FieldDescription>支持中文，并以明文形式保存在当前设备。</FieldDescription>
      </Field>
      <Field>
        <FieldTitle id={`scene-${step.id}`}>挑战场景</FieldTitle>
        <ToggleGroup
          type="single"
          value={step.scene.kind}
          onValueChange={(kind) => {
            if (kind === 'default') onChange((draft) => { draft.scene = { kind: 'default' } })
            if (kind === 'custom') onChange((draft) => {
              draft.scene = {
                kind: 'custom',
                document: { html: DEFAULT_CUSTOM_DOCUMENT, reviewState: 'required' },
              }
            })
          }}
          variant="outline"
          spacing={2}
          aria-labelledby={`scene-${step.id}`}
        >
          <ToggleGroupItem value="default">默认闸门</ToggleGroupItem>
          <ToggleGroupItem value="custom"><BracesIcon data-icon="inline-start" />自定义 HTML</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {step.scene.kind === 'custom' ? (
        <ChallengeDocumentEditor
          document={step.scene.document}
          title="文本挑战场景 HTML"
          onChange={(document) => onChange((draft) => {
            if (draft.scene.kind === 'custom') draft.scene.document = document
          })}
        />
      ) : null}
    </FieldGroup>
  )
}

function TemplateSourceEditor({
  idPrefix,
  source,
  onChange,
  onCopy,
}: {
  idPrefix: string
  source: OfficialTemplateSource
  onChange: (source: OfficialTemplateSource) => void
  onCopy: () => void
}) {
  const [previewSession, setPreviewSession] = useState('')
  const [previewCompleted, setPreviewCompleted] = useState(false)
  const html = renderOfficialTemplate(source)
  return (
    <div className="template-editor">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`official-template-${idPrefix}`}>官方模板</FieldLabel>
          <Select
            value={source.templateId}
            onValueChange={(templateId) => onChange(defaultTemplateSource(templateId as OfficialTemplateSource['templateId']))}
          >
            <SelectTrigger id={`official-template-${idPrefix}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {OFFICIAL_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{OFFICIAL_TEMPLATES.find((template) => template.id === source.templateId)?.description}</FieldDescription>
        </Field>
        {source.templateId === 'wooden-fish' ? (
          <Field>
            <FieldLabel htmlFor={`wooden-fish-hits-${idPrefix}`}>完成所需点击次数</FieldLabel>
            <Input
              id={`wooden-fish-hits-${idPrefix}`}
              type="number"
              min="1"
              max="20"
              value={source.parameters.requiredHits}
              onChange={(event) => onChange({
                ...source,
                parameters: { requiredHits: Number(event.target.value) },
              })}
            />
          </Field>
        ) : (
          <div className="template-parameter-grid">
            <Field>
              <FieldLabel htmlFor={`reaction-minimum-${idPrefix}`}>最短等待（毫秒）</FieldLabel>
              <Input
                id={`reaction-minimum-${idPrefix}`}
                type="number"
                min="500"
                max="10000"
                value={source.parameters.minimumDelayMs}
                onChange={(event) => onChange({ ...source, parameters: { ...source.parameters, minimumDelayMs: Number(event.target.value) } })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`reaction-maximum-${idPrefix}`}>最长等待（毫秒）</FieldLabel>
              <Input
                id={`reaction-maximum-${idPrefix}`}
                type="number"
                min="500"
                max="15000"
                value={source.parameters.maximumDelayMs}
                onChange={(event) => onChange({ ...source, parameters: { ...source.parameters, maximumDelayMs: Number(event.target.value) } })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`reaction-window-${idPrefix}`}>成功窗口（毫秒）</FieldLabel>
              <Input
                id={`reaction-window-${idPrefix}`}
                type="number"
                min="100"
                max="3000"
                value={source.parameters.successWindowMs}
                onChange={(event) => onChange({ ...source, parameters: { ...source.parameters, successWindowMs: Number(event.target.value) } })}
              />
            </Field>
          </div>
        )}
      </FieldGroup>
      <div className="document-toolbar">
        <Button type="button" variant="outline" onClick={onCopy}>
          <CopyIcon data-icon="inline-start" />复制为自定义代码
        </Button>
        <Button
          type="button"
          onClick={() => {
            setPreviewCompleted(false)
            setPreviewSession(crypto.randomUUID())
          }}
        >
          <PlayIcon data-icon="inline-start" />运行模板预览
        </Button>
      </div>
      {previewSession ? (
        <SandboxPreviewPanel
          html={html}
          sessionId={previewSession}
          title="官方模板预览"
          completed={previewCompleted}
          onComplete={() => setPreviewCompleted(true)}
        />
      ) : null}
    </div>
  )
}

function InteractiveStepEditor({
  step,
  onChange,
}: {
  step: InteractiveChallengeStep
  onChange: (mutate: (step: InteractiveChallengeStep) => void) => void
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldTitle id={`source-${step.id}`}>互动来源</FieldTitle>
        <ToggleGroup
          type="single"
          value={step.source.kind}
          onValueChange={(kind) => {
            if (kind === 'template') onChange((draft) => { draft.source = defaultTemplateSource('wooden-fish') })
            if (kind === 'custom') onChange((draft) => {
              draft.source = {
                kind: 'custom',
                document: { html: DEFAULT_INTERACTIVE_DOCUMENT, reviewState: 'required' },
              }
            })
          }}
          variant="outline"
          spacing={2}
          aria-labelledby={`source-${step.id}`}
        >
          <ToggleGroupItem value="template"><MousePointerClickIcon data-icon="inline-start" />官方模板</ToggleGroupItem>
          <ToggleGroupItem value="custom"><BracesIcon data-icon="inline-start" />自定义 HTML</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {step.source.kind === 'template' ? (
        <TemplateSourceEditor
          idPrefix={step.id}
          source={step.source}
          onChange={(source) => onChange((draft) => { draft.source = source })}
          onCopy={() => onChange((draft) => {
            draft.source = {
              kind: 'custom',
              document: { html: renderOfficialTemplate(step.source as OfficialTemplateSource), reviewState: 'required' },
            }
          })}
        />
      ) : (
        <>
          <Alert>
            <BracesIcon />
            <AlertTitle>完成接口</AlertTitle>
            <AlertDescription>在交互达成时调用 <code>window.PilotGuardian.complete()</code>，重复调用只会生效一次。</AlertDescription>
          </Alert>
          <ChallengeDocumentEditor
            document={step.source.document}
            title="交互挑战 HTML"
            onChange={(document) => onChange((draft) => {
              if (draft.source.kind === 'custom') draft.source.document = document
            })}
          />
        </>
      )}
    </FieldGroup>
  )
}

function ChallengeUnit({
  challenge,
  index,
  total,
  onUpdate,
}: {
  challenge: ChallengeStep
  index: number
  total: number
  onUpdate: (mutate: (draft: AccessRule) => void) => void
}) {
  const [pendingType, setPendingType] = useState<ChallengeStep['type']>()
  const updateStep = <T extends ChallengeStep>(type: T['type'], mutate: (step: T) => void) => {
    onUpdate((draft) => {
      const current = draft.challenges[index]
      if (!current || current.type !== type) return
      mutate(current as T)
    })
  }
  const confirmTypeChange = () => {
    if (!pendingType) return
    onUpdate((draft) => {
      const replacement = createChallenge(pendingType)
      replacement.id = challenge.id
      draft.challenges[index] = replacement
    })
    setPendingType(undefined)
  }

  return (
    <Card className="challenge-unit">
      <CardHeader>
        <div className="challenge-number">{String(index + 1).padStart(2, '0')}</div>
        <div>
          <CardDescription>CHALLENGE STEP</CardDescription>
          <CardTitle>{challenge.type === 'text' ? '文本挑战' : '交互挑战'}</CardTitle>
        </div>
        <div className="challenge-actions">
          <Button variant="ghost" size="icon" onClick={() => onUpdate((draft) => {
            if (index < 1) return
            const previous = draft.challenges[index - 1]
            const current = draft.challenges[index]
            if (previous && current) [draft.challenges[index - 1], draft.challenges[index]] = [current, previous]
          })} disabled={index === 0} aria-label={`上移第 ${index + 1} 个挑战步骤`}><ArrowUpIcon /></Button>
          <Button variant="ghost" size="icon" onClick={() => onUpdate((draft) => {
            if (index >= draft.challenges.length - 1) return
            const next = draft.challenges[index + 1]
            const current = draft.challenges[index]
            if (next && current) [draft.challenges[index], draft.challenges[index + 1]] = [next, current]
          })} disabled={index === total - 1} aria-label={`下移第 ${index + 1} 个挑战步骤`}><ArrowDownIcon /></Button>
          <Button variant="destructive" size="icon" disabled={total === 1} onClick={() => onUpdate((draft) => { draft.challenges.splice(index, 1) })} aria-label={`删除第 ${index + 1} 个挑战步骤`}><Trash2Icon /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldTitle id={`challenge-type-${challenge.id}`}>挑战类型</FieldTitle>
            <ToggleGroup
              type="single"
              value={challenge.type}
              onValueChange={(type) => {
                if (type && type !== challenge.type) setPendingType(type as ChallengeStep['type'])
              }}
              variant="outline"
              spacing={2}
              aria-labelledby={`challenge-type-${challenge.id}`}
            >
              <ToggleGroupItem value="text"><TypeIcon data-icon="inline-start" />文本挑战</ToggleGroupItem>
              <ToggleGroupItem value="interactive"><MousePointerClickIcon data-icon="inline-start" />交互挑战</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {challenge.type === 'text' ? (
            <TextStepEditor step={challenge} onChange={(mutate) => updateStep('text', mutate)} />
          ) : (
            <InteractiveStepEditor step={challenge} onChange={(mutate) => updateStep('interactive', mutate)} />
          )}
        </FieldGroup>
      </CardContent>

      <AlertDialog open={Boolean(pendingType)} onOpenChange={(open) => { if (!open) setPendingType(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><TriangleAlertIcon /></AlertDialogMedia>
            <AlertDialogTitle>切换挑战类型？</AlertDialogTitle>
            <AlertDialogDescription>当前步骤中不兼容的答案、模板和自定义 HTML 将被删除，此操作在保存前仍可通过刷新页面撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmTypeChange}>确认切换</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function ChallengeEditor({ rule, onUpdate }: Pick<RuleEditorProps, 'rule' | 'onUpdate'>) {
  return (
    <Card>
      <CardHeader>
        <div className="card-heading-icon"><KeyRoundIcon aria-hidden="true" /></div>
        <div><CardTitle>挑战序列</CardTitle><CardDescription>文本答案与完整互动体验可以自由组合。</CardDescription></div>
        <Badge variant="outline">{rule.challenges.length} STEPS</Badge>
      </CardHeader>
      <CardContent>
        <div className="challenge-stack">
          {rule.challenges.map((challenge, index) => (
            <ChallengeUnit
              key={challenge.id}
              challenge={challenge}
              index={index}
              total={rule.challenges.length}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={() => onUpdate((draft) => { draft.challenges.push(createTextChallenge()) })}>
          <PlusIcon data-icon="inline-start" />添加挑战步骤
        </Button>
      </CardFooter>
      <Separator />
    </Card>
  )
}
