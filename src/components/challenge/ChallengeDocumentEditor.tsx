import { useRef, useState, type ChangeEvent } from 'react'
import {
  BadgeCheckIcon,
  CircleAlertIcon,
  FileCode2Icon,
  PlayIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/src/components/ui/field'
import { Input } from '@/src/components/ui/input'
import { MAX_CUSTOM_DOCUMENT_BYTES, type CustomChallengeDocument } from '@/src/domain/types'
import { CodeEditor } from './CodeEditor'
import { SandboxFrame } from './SandboxFrame'

interface PreviewState {
  html: string
  sessionId: string
}

interface ChallengeDocumentEditorProps {
  document: CustomChallengeDocument
  onChange: (document: CustomChallengeDocument) => void
  title?: string
}

export function ChallengeDocumentEditor({
  document,
  onChange,
  title = '自定义 HTML',
}: ChallengeDocumentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewState>()
  const [previewError, setPreviewError] = useState('')
  const [completed, setCompleted] = useState(false)

  const updateHtml = (html: string) => {
    setPreview(undefined)
    setPreviewError('')
    setCompleted(false)
    onChange({ html, reviewState: 'required' })
  }

  const importHtml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const html = await file.text()
    if (new TextEncoder().encode(html).byteLength > MAX_CUSTOM_DOCUMENT_BYTES) {
      toast.error('HTML 文件超过 256KB 上限')
      return
    }
    updateHtml(html)
    toast.success('HTML 已作为快照导入')
  }

  const runPreview = () => {
    if (!document.html.trim()) {
      setPreviewError('请先输入完整 HTML 文档')
      return
    }
    setPreviewError('')
    setCompleted(false)
    setPreview({ html: document.html, sessionId: crypto.randomUUID() })
  }

  return (
    <div className="document-workbench">
      <FieldGroup>
        <Field>
          <div className="document-heading">
            <div>
              <FieldLabel>{title}</FieldLabel>
              <FieldDescription>粘贴代码或选择本地 HTML；文件会嵌入配置，不保留路径关联。</FieldDescription>
            </div>
            <Badge variant={document.reviewState === 'ready' ? 'default' : 'secondary'}>
              {document.reviewState === 'ready' ? '已通过预览' : '需要预览'}
            </Badge>
          </div>
          <Input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".html,.htm,text/html"
            onChange={(event) => void importHtml(event)}
          />
          <div className="document-toolbar">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileCode2Icon data-icon="inline-start" />导入本地 HTML
            </Button>
            <Button type="button" onClick={runPreview}>
              {preview ? <RotateCcwIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {preview ? '重新运行预览' : '运行沙箱预览'}
            </Button>
          </div>
          <CodeEditor value={document.html} onChange={updateHtml} label={`${title}代码编辑器`} />
        </Field>
      </FieldGroup>

      {previewError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>预览未能启动</AlertTitle>
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      ) : null}

      {preview ? (
        <Card className="document-preview-card">
          <CardHeader>
            <div>
              <CardDescription>OFFLINE SANDBOX</CardDescription>
              <CardTitle>隔离预览</CardTitle>
            </div>
            {completed ? <Badge><BadgeCheckIcon data-icon="inline-start" />已收到完成信号</Badge> : null}
          </CardHeader>
          <CardContent>
            <SandboxFrame
              html={preview.html}
              sessionId={preview.sessionId}
              title={`${title}沙箱预览`}
              onBoot={() => {
                setPreviewError('')
                if (preview.html === document.html && document.reviewState !== 'ready') {
                  onChange({ ...document, reviewState: 'ready' })
                }
              }}
              onComplete={() => setCompleted(true)}
              onError={setPreviewError}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
