import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Maximize2Icon, Minimize2Icon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/src/components/ui/toggle-group'
import { cn } from '@/src/lib/utils'
import type { SandboxMetrics } from '@/src/sandbox/protocol'
import { SandboxFrame } from './SandboxFrame'

const DESKTOP_WIDTH = 1440
const DESKTOP_HEIGHT = 900

interface SandboxPreviewPanelProps {
  html: string
  sessionId: string
  title: string
  completed?: boolean
  onBoot?: () => void
  onComplete?: () => void
  onError?: (message: string) => void
}

export function SandboxPreviewPanel({
  html,
  sessionId,
  title,
  completed = false,
  onBoot,
  onComplete,
  onError,
}: SandboxPreviewPanelProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'fit' | 'actual'>('fit')
  const [bounds, setBounds] = useState({ width: 960, height: 540 })
  const [fullscreen, setFullscreen] = useState(false)
  const [metrics, setMetrics] = useState<SandboxMetrics>()

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => {
      const next = { width: viewport.clientWidth, height: viewport.clientHeight }
      setBounds((current) => current.width === next.width && current.height === next.height ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === cardRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => setMetrics(undefined), [sessionId])

  const scale = useMemo(() => {
    if (fullscreen || mode === 'actual') return 1
    return Math.min(1, Math.max(0.1, Math.min(bounds.width / DESKTOP_WIDTH, bounds.height / DESKTOP_HEIGHT)))
  }, [bounds.height, bounds.width, fullscreen, mode])
  const useFluidViewport = fullscreen
  const canvasStyle: CSSProperties = useFluidViewport
    ? { width: '100%', height: '100%' }
    : { width: DESKTOP_WIDTH * scale, height: DESKTOP_HEIGHT * scale }
  const frameStyle: CSSProperties = useFluidViewport
    ? { width: '100%', height: '100%' }
    : {
        width: DESKTOP_WIDTH,
        height: DESKTOP_HEIGHT,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }
  const overflowLabel = metrics?.overflowX && metrics.overflowY
    ? '内容横向及纵向溢出'
    : metrics?.overflowX
      ? '内容横向溢出'
      : metrics?.overflowY
        ? '内容纵向溢出'
        : ''

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === cardRef.current) await document.exitFullscreen()
      else await cardRef.current?.requestFullscreen()
    } catch {
      onError?.('浏览器未能进入全屏预览')
    }
  }

  return (
    <Card ref={cardRef} className="document-preview-card">
      <CardHeader>
        <div>
          <CardDescription>DESKTOP / 1440 × 900</CardDescription>
          <CardTitle>{title}</CardTitle>
        </div>
        <div className="document-preview-controls">
          {completed ? <Badge>已收到完成信号</Badge> : null}
          {!fullscreen ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={mode}
              onValueChange={(value) => { if (value) setMode(value as 'fit' | 'actual') }}
              aria-label="预览缩放模式"
            >
              <ToggleGroupItem value="fit">适应窗口</ToggleGroupItem>
              <ToggleGroupItem value="actual">1:1</ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void toggleFullscreen()}>
            {fullscreen
              ? <Minimize2Icon data-icon="inline-start" />
              : <Maximize2Icon data-icon="inline-start" />}
            {fullscreen ? '退出全屏' : '全屏预览'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={viewportRef}
          className={cn('document-preview-viewport', mode === 'fit' && !fullscreen && 'is-fit')}
        >
          <div className="document-preview-canvas" style={canvasStyle}>
            <SandboxFrame
              html={html}
              sessionId={sessionId}
              title={`${title}沙箱`}
              style={frameStyle}
              onMetrics={setMetrics}
              {...(onBoot ? { onBoot } : {})}
              {...(onComplete ? { onComplete } : {})}
              {...(onError ? { onError } : {})}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="document-preview-readout">
        <span>{fullscreen ? '浏览器可用尺寸' : `${DESKTOP_WIDTH} × ${DESKTOP_HEIGHT}`}</span>
        <span>{fullscreen ? '自动' : `${Math.round(scale * 100)}%`}</span>
        {metrics ? <span>内容 {metrics.contentWidth} × {metrics.contentHeight}</span> : null}
        {overflowLabel ? (
          <Badge variant="secondary"><TriangleAlertIcon data-icon="inline-start" />{overflowLabel}，可在画面内滚动</Badge>
        ) : null}
      </CardFooter>
    </Card>
  )
}
