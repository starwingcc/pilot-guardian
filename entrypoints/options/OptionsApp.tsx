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
import {
  findMatchingRule,
  parseUrlPattern,
  patternSetsMayOverlap,
} from '../../src/domain/url-pattern'
import type { ConfigMutationResponse } from '../../src/runtime/messages'
import { validateExportBundle, validateStoredConfig } from '../../src/domain/validation'
import { sendRuntimeMessage } from '../../src/ui/runtime-client'
import { RuleDiagnostics } from './components/RuleDiagnostics'
import { RuleEditor } from './components/RuleEditor'
import { RuleRail } from './components/RuleRail'

function reindexRules(rules: AccessRule[]): AccessRule[] {
  return rules.map((rule, priority) => ({ ...rule, priority }))
}

export function OptionsApp() {
  const [rules, setRules] = useState<AccessRule[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [testUrl, setTestUrl] = useState('https://www.baidu.com/')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirtyRuleIds, setDirtyRuleIds] = useState<Set<string>>(() => new Set())
  const [persistedRuleIds, setPersistedRuleIds] = useState<Set<string>>(() => new Set())
  const [errors, setErrors] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<ExportBundle>()
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void sendRuntimeMessage<StoredConfig>({ type: 'config:get' })
      .then((config) => {
        setRules(config.rules)
        setPersistedRuleIds(new Set(config.rules.map((rule) => rule.id)))
        setSelectedId(config.rules[0]?.id)
      })
      .catch((error: unknown) => {
        setErrors([error instanceof Error ? error.message : '配置读取失败'])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (dirtyRuleIds.size === 0) return
    const warnAboutDrafts = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnAboutDrafts)
    return () => window.removeEventListener('beforeunload', warnAboutDrafts)
  }, [dirtyRuleIds.size])

  const selectedIndex = rules.findIndex((rule) => rule.id === selectedId)
  const selected = selectedIndex >= 0 ? rules[selectedIndex] : undefined
  const conflicts = useMemo(() => {
    const ids = new Set<string>()
    for (let left = 0; left < rules.length; left += 1) {
      for (let right = left + 1; right < rules.length; right += 1) {
        const leftRule = rules[left]
        const rightRule = rules[right]
        if (leftRule && rightRule && patternSetsMayOverlap(leftRule.urlPatterns, rightRule.urlPatterns)) {
          ids.add(leftRule.id)
          ids.add(rightRule.id)
        }
      }
    }
    return ids
  }, [rules])
  const testMatch = findMatchingRule(rules, testUrl)
  const selectedUrlPatternsValid = Boolean(
    selected &&
    selected.urlPatterns.length > 0 &&
    selected.urlPatterns.every((pattern) => parseUrlPattern(pattern).ok) &&
    new Set(selected.urlPatterns).size === selected.urlPatterns.length,
  )

  const markChanged = (ruleId: string) => {
    setDirtyRuleIds((current) => new Set(current).add(ruleId))
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
    if (selectedId) markChanged(selectedId)
  }

  const addRule = () => {
    const rule = createDefaultRule()
    rule.priority = rules.length
    setRules((current) => [...current, rule])
    setSelectedId(rule.id)
    markChanged(rule.id)
  }

  const moveRule = async (direction: -1 | 1) => {
    if (saving) return
    const target = selectedIndex + direction
    if (selectedIndex < 0 || target < 0 || target >= rules.length) return
    const next = [...rules]
    const currentRule = next[selectedIndex]
    const targetRule = next[target]
    if (!currentRule || !targetRule) return
    next[selectedIndex] = targetRule
    next[target] = currentRule
    const reindexed = reindexRules(next)
    const previousPersistedOrder = rules
      .filter((rule) => persistedRuleIds.has(rule.id))
      .map((rule) => rule.id)
    const nextPersistedOrder = reindexed
      .filter((rule) => persistedRuleIds.has(rule.id))
      .map((rule) => rule.id)
    if (previousPersistedOrder.every((id, index) => id === nextPersistedOrder[index])) {
      setRules(reindexed)
      return
    }

    setSaving(true)
    try {
      const response = await sendRuntimeMessage<ConfigMutationResponse>({
        type: 'config:reorder-rules',
        ruleIds: nextPersistedOrder,
      })
      if (!response.ok) {
        setErrors(response.errors)
        toast.error('规则排序失败')
        return
      }
      setRules(reindexed)
      setErrors([])
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '规则排序失败'])
      toast.error('规则排序失败')
    } finally {
      setSaving(false)
    }
  }

  const removeRule = async () => {
    if (!selected || saving) return
    const removing = selected
    const next = reindexRules(rules
      .filter((rule) => rule.id !== selected.id)
    )
    if (persistedRuleIds.has(removing.id)) {
      setSaving(true)
      try {
        const response = await sendRuntimeMessage<ConfigMutationResponse>({
          type: 'config:delete-rule',
          ruleId: removing.id,
        })
        if (!response.ok) {
          setErrors(response.errors)
          toast.error('规则删除失败')
          return
        }
      } catch (error) {
        setErrors([error instanceof Error ? error.message : '规则删除失败'])
        toast.error('规则删除失败')
        return
      } finally {
        setSaving(false)
      }
    }
    setRules(next)
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id)
    setPersistedRuleIds((current) => {
      const updated = new Set(current)
      updated.delete(removing.id)
      return updated
    })
    setDirtyRuleIds((current) => {
      const updated = new Set(current)
      updated.delete(removing.id)
      return updated
    })
    setErrors([])
    setDeleteOpen(false)
    toast.success(persistedRuleIds.has(removing.id) ? '规则已删除' : '未保存的规则草稿已移除')
  }

  const save = async () => {
    if (!selected || saving) return
    if (selected.mode !== 'schedule' && hasUnreviewedDocuments(selected)) {
      setErrors(['修改后的自定义 HTML 必须成功运行沙箱预览后才能保存'])
      toast.error('请先预览自定义 HTML')
      return
    }
    const localValidation = validateStoredConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      rules: [selected],
    })
    if (!localValidation.ok) {
      setErrors(localValidation.errors)
      toast.error('当前规则校验失败')
      return
    }

    const isNewRule = !persistedRuleIds.has(selected.id)
    const insertBeforeRuleId = isNewRule
      ? rules.slice(selectedIndex + 1).find((rule) => persistedRuleIds.has(rule.id))?.id
      : undefined
    setSaving(true)
    try {
      const response = await sendRuntimeMessage<ConfigMutationResponse>({
        type: 'config:save-rule',
        rule: selected,
        ...(insertBeforeRuleId ? { insertBeforeRuleId } : {}),
      })
      if (!response.ok) {
        setErrors(response.errors)
        toast.error('当前规则保存失败')
        return
      }
      const savedRule = response.config.rules.find((rule) => rule.id === selected.id)
      if (!savedRule) throw new Error('保存结果缺少当前规则')
      setRules((current) => reindexRules(current.map((rule) =>
        rule.id === savedRule.id ? savedRule : rule)))
      setPersistedRuleIds((current) => new Set(current).add(savedRule.id))
      setDirtyRuleIds((current) => {
        const updated = new Set(current)
        updated.delete(savedRule.id)
        return updated
      })
      setErrors([])
      toast.success('当前规则已保存', { description: '浏览器拦截规则已经同步。' })
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '当前规则保存失败'])
      toast.error('当前规则保存失败')
    } finally {
      setSaving(false)
    }
  }

  const exportConfig = async () => {
    try {
      const config = await sendRuntimeMessage<StoredConfig>({ type: 'config:get' })
      const bundle: ExportBundle = {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        rules: config.rules,
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
      toast.success('已保存配置已导出', {
        description: dirtyRuleIds.size > 0 ? '未保存的规则草稿未包含在导出文件中。' : undefined,
      })
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '配置导出失败'])
      toast.error('配置导出失败')
    }
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
    if (!pendingImport || saving) return
    setSaving(true)
    try {
      const response = await sendRuntimeMessage<ConfigMutationResponse>({
        type: 'config:replace',
        rules: pendingImport.rules,
      })
      if (!response.ok) {
        setErrors(response.errors)
        toast.error('配置导入失败')
        return
      }
      setRules(response.config.rules)
      setPersistedRuleIds(new Set(response.config.rules.map((rule) => rule.id)))
      setDirtyRuleIds(new Set())
      setSelectedId(response.config.rules[0]?.id)
      setPendingImport(undefined)
      setErrors([])
      toast.success('配置已导入', { description: '含自定义代码的规则已停用，预览后可手动启用。' })
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '配置导入失败'])
      toast.error('配置导入失败')
    } finally {
      setSaving(false)
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
            <Badge variant={dirtyRuleIds.size > 0 ? 'secondary' : 'outline'}>
              {dirtyRuleIds.size > 0 ? `${dirtyRuleIds.size} 条规则未保存` : '配置已同步'}
            </Badge>
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
            <Button variant="outline" onClick={() => setExportOpen(true)} disabled={persistedRuleIds.size === 0}>
              <DownloadIcon data-icon="inline-start" />导出
            </Button>
            <Button
              onClick={() => void save()}
              disabled={
                saving ||
                !selected ||
                !dirtyRuleIds.has(selected.id) ||
                !selectedUrlPatternsValid
              }
            >
              {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              {saving ? '正在同步' : '保存当前规则'}
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
            dirtyRuleIds={dirtyRuleIds}
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
                onMove={(direction) => void moveRule(direction)}
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
                “{selected?.name}”将立即从已保存配置和浏览器拦截规则中删除；未保存的新规则只会移除草稿。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void removeRule()}>移除规则</AlertDialogAction>
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
              <AlertDialogAction onClick={() => void exportConfig()}>继续导出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={Boolean(pendingImport)} onOpenChange={(open) => { if (!open) setPendingImport(undefined) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia><FileUpIcon /></AlertDialogMedia>
              <AlertDialogTitle>覆盖当前配置？</AlertDialogTitle>
              <AlertDialogDescription>
                导入的 {pendingImport?.rules.length ?? 0} 条规则将替换已保存配置并清除所有未保存草稿。含自定义代码的规则会保持停用，直到完成预览并由你手动启用。
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
