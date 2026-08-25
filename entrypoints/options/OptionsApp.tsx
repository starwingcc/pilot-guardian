import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  DownloadIcon,
  FileUpIcon,
  MenuIcon,
  PlusIcon,
  SaveIcon,
  ShieldAlertIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert'
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
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/src/components/ui/sheet'
import { Skeleton } from '@/src/components/ui/skeleton'
import { Spinner } from '@/src/components/ui/spinner'
import { Toaster } from '@/src/components/ui/sonner'
import { TooltipProvider } from '@/src/components/ui/tooltip'
import { Input } from '@/src/components/ui/input'
import { createDefaultRule } from '../../src/domain/defaults'
import { hasUnreviewedDocuments, markCustomDocumentsForReview } from '../../src/domain/custom-documents'
import {
  CONFIG_SCHEMA_VERSION,
  type AccessRule,
  type ExportBundle,
  type StoredConfig,
} from '../../src/domain/types'
import { findMatchingRule, patternsMayOverlap } from '../../src/domain/url-pattern'
import { validateExportBundle, validateStoredConfig } from '../../src/domain/validation'
import { sendRuntimeMessage } from '../../src/ui/runtime-client'
import { RuleDiagnostics } from './components/RuleDiagnostics'
import { RuleEditor } from './components/RuleEditor'
import { RuleRail } from './components/RuleRail'

type SaveResponse = { ok: true } | { ok: false; errors: string[] }

function nextDnrId(rules: AccessRule[]): number {
  return rules.reduce((maximum, rule) => Math.max(maximum, rule.dnrRuleId), 0) + 1
}

export function OptionsApp() {
  const [rules, setRules] = useState<AccessRule[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [testUrl, setTestUrl] = useState('https://www.baidu.com/')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<ExportBundle>()
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void sendRuntimeMessage<StoredConfig>({ type: 'config:get' })
      .then((config) => {
        setRules(config.rules)
        setSelectedId(config.rules[0]?.id)
      })
      .catch((error: unknown) => {
        setErrors([error instanceof Error ? error.message : '配置读取失败'])
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedIndex = rules.findIndex((rule) => rule.id === selectedId)
  const selected = selectedIndex >= 0 ? rules[selectedIndex] : undefined
  const conflicts = useMemo(() => {
    const ids = new Set<string>()
    for (let left = 0; left < rules.length; left += 1) {
      for (let right = left + 1; right < rules.length; right += 1) {
        const leftRule = rules[left]
        const rightRule = rules[right]
        if (leftRule && rightRule && patternsMayOverlap(leftRule.target, rightRule.target)) {
          ids.add(leftRule.id)
          ids.add(rightRule.id)
        }
      }
    }
    return ids
  }, [rules])
  const testMatch = findMatchingRule(rules, testUrl)

  const markChanged = () => {
    setDirty(true)
    setErrors([])
  }

  const updateRule = (mutate: (draft: AccessRule) => void) => {
    if (selectedIndex < 0) return
    setRules((current) => current.map((rule, index) => {
      if (index !== selectedIndex) return rule
      const draft = structuredClone(rule)
      mutate(draft)
      return draft
    }))
    markChanged()
  }

  const addRule = () => {
    const rule = createDefaultRule(nextDnrId(rules))
    rule.priority = rules.length
    setRules((current) => [...current, rule])
    setSelectedId(rule.id)
    markChanged()
  }

  const moveRule = (direction: -1 | 1) => {
    const target = selectedIndex + direction
    if (selectedIndex < 0 || target < 0 || target >= rules.length) return
    setRules((current) => {
      const next = [...current]
      const currentRule = next[selectedIndex]
      const targetRule = next[target]
      if (!currentRule || !targetRule) return current
      next[selectedIndex] = targetRule
      next[target] = currentRule
      return next.map((rule, priority) => ({ ...rule, priority }))
    })
    markChanged()
  }

  const removeRule = () => {
    if (!selected) return
    const next = rules
      .filter((rule) => rule.id !== selected.id)
      .map((rule, priority) => ({ ...rule, priority }))
    setRules(next)
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id)
    setDeleteOpen(false)
    markChanged()
    toast('规则已从草稿移除', { description: '保存配置后才会更新浏览器拦截。' })
  }

  const persistRules = async (
    nextRules: AccessRule[],
    options: { allowUnreviewed?: boolean } = {},
  ): Promise<boolean> => {
    const normalized = nextRules.map((rule, priority) => ({ ...rule, priority }))
    if (!options.allowUnreviewed && normalized.some(hasUnreviewedDocuments)) {
      setErrors(['修改后的自定义 HTML 必须成功运行沙箱预览后才能保存'])
      toast.error('请先预览自定义 HTML')
      return false
    }
    const localValidation = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: normalized,
    })
    if (!localValidation.ok) {
      setErrors(localValidation.errors)
      toast.error('配置校验失败')
      return false
    }

    setSaving(true)
    try {
      const response = await sendRuntimeMessage<SaveResponse>({
        type: 'config:save',
        rules: normalized,
      })
      if (!response.ok) {
        setErrors(response.errors)
        toast.error('配置保存失败')
        return false
      }
      setRules(normalized)
      setErrors([])
      setDirty(false)
      return true
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '配置保存失败'])
      toast.error('配置保存失败')
      return false
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (await persistRules(rules)) {
      toast.success('配置已保存', { description: '浏览器拦截规则已经同步。' })
    }
  }

  const exportConfig = () => {
    const bundle: ExportBundle = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      rules,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `pilot-guardian-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
    toast.success('配置已导出')
  }

  const prepareImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = validateExportBundle(JSON.parse(await file.text()))
      if (!parsed.ok) {
        setErrors(parsed.errors)
        toast.error('导入文件无效')
        return
      }
      setPendingImport({
        ...parsed.value,
        rules: parsed.value.rules.map(markCustomDocumentsForReview),
      })
    } catch {
      setErrors(['无法解析导入文件'])
      toast.error('无法解析导入文件')
    }
  }

  const importConfig = async () => {
    if (!pendingImport) return
    if (await persistRules(pendingImport.rules, { allowUnreviewed: true })) {
      setSelectedId(pendingImport.rules[0]?.id)
      setPendingImport(undefined)
      toast.success('配置已导入', { description: '含自定义代码的规则已停用，预览后可手动启用。' })
    }
  }

  return (
    <TooltipProvider>
      <main className="options-shell">
        <div className="ambient-grid" aria-hidden="true" />
        <header className="mission-header">
          <div className="brand-lockup">
            <div className="brand-glyph" aria-hidden="true"><ShieldAlertIcon /></div>
            <div>
              <span className="kicker">PILOT GUARDIAN / CONTROL NODE</span>
              <h1>访问航线控制台</h1>
            </div>
          </div>
          <div className="mission-actions">
            <Badge variant={dirty ? 'secondary' : 'outline'}>{dirty ? '存在未保存更改' : '配置已同步'}</Badge>
            <Input
              ref={importInput}
              className="sr-only"
              type="file"
              accept="application/json"
              onChange={(event) => void prepareImport(event)}
            />
            <Button variant="outline" onClick={() => importInput.current?.click()}>
              <FileUpIcon data-icon="inline-start" />导入
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)} disabled={rules.length === 0}>
              <DownloadIcon data-icon="inline-start" />导出
            </Button>
            <Button onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              {saving ? '正在同步' : '保存配置'}
            </Button>
          </div>
        </header>

        {errors.length > 0 ? (
          <Alert variant="destructive" className="mission-alert">
            <ShieldAlertIcon />
            <AlertTitle>配置需要修正</AlertTitle>
            <AlertDescription>{errors.join('；')}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mission-grid">
          <RuleRail
            rules={rules}
            selectedId={selectedId}
            conflicts={conflicts}
            loading={loading}
            onSelect={setSelectedId}
            onAdd={addRule}
          />

          <section className="editor-deck" aria-label="规则编辑器">
            {loading ? (
              <div className="loading-stack" aria-label="正在读取配置">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-72 w-full" />
              </div>
            ) : selected ? (
              <RuleEditor
                rule={selected}
                index={selectedIndex}
                total={rules.length}
                hasConflict={conflicts.has(selected.id)}
                onUpdate={updateRule}
                onMove={moveRule}
                onDelete={() => setDeleteOpen(true)}
              />
            ) : (
              <div className="empty-deck">
                <div className="empty-orbit" aria-hidden="true"><PlusIcon /></div>
                <p className="kicker">NO FLIGHT PLAN</p>
                <h2>建立第一条访问航线</h2>
                <p>为容易分心的网站部署口令、时间周期，或把两者组合为多阶段闸门。</p>
                <Button size="lg" onClick={addRule}><PlusIcon data-icon="inline-start" />新建规则</Button>
              </div>
            )}
          </section>

          {selected ? (
            <aside className="diagnostics-deck">
              <RuleDiagnostics
                rule={selected}
                testUrl={testUrl}
                onTestUrlChange={setTestUrl}
                testMatch={testMatch}
              />
            </aside>
          ) : null}
        </div>

        {selected ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button className="diagnostics-trigger" variant="secondary" size="lg">
                <MenuIcon data-icon="inline-start" />打开规则诊断
              </Button>
            </SheetTrigger>
            <SheetContent className="diagnostics-sheet">
              <SheetHeader>
                <SheetTitle>规则诊断</SheetTitle>
                <SheetDescription>检查测试地址最终会命中哪一条访问规则。</SheetDescription>
              </SheetHeader>
              <RuleDiagnostics
                rule={selected}
                testUrl={testUrl}
                onTestUrlChange={setTestUrl}
                testMatch={testMatch}
              />
            </SheetContent>
          </Sheet>
        ) : null}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia><ShieldAlertIcon /></AlertDialogMedia>
              <AlertDialogTitle>移除这条航线？</AlertDialogTitle>
              <AlertDialogDescription>
                “{selected?.name}”会从当前草稿删除，保存配置后正式生效。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={removeRule}>移除规则</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia><DownloadIcon /></AlertDialogMedia>
              <AlertDialogTitle>导出包含明文口令</AlertDialogTitle>
              <AlertDialogDescription>请只把配置文件保存到可信位置，不要通过公开渠道分享。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={exportConfig}>继续导出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={Boolean(pendingImport)} onOpenChange={(open) => { if (!open) setPendingImport(undefined) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia><FileUpIcon /></AlertDialogMedia>
              <AlertDialogTitle>覆盖当前配置？</AlertDialogTitle>
              <AlertDialogDescription>
                导入的 {pendingImport?.rules.length ?? 0} 条规则将替换当前配置。含自定义代码的规则会保持停用，直到完成预览并由你手动启用。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => void importConfig()}>确认导入</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
