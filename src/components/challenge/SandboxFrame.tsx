import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { cn } from '@/src/lib/utils'
import {
  SANDBOX_HOST_CHANNEL,
  isSandboxHostEvent,
  type SandboxMetrics,
  type SandboxLoadMessage,
} from '@/src/sandbox/protocol'

interface SandboxFrameProps {
  html: string
  sessionId: string
  title: string
  className?: string
  style?: CSSProperties
  onBoot?: () => void
  onComplete?: () => void
  onError?: (message: string) => void
  onMetrics?: (metrics: SandboxMetrics) => void
}

export function SandboxFrame({
  html,
  sessionId,
  title,
  className,
  style,
  onBoot,
  onComplete,
  onError,
  onMetrics,
}: SandboxFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const callbacksRef = useRef({ onBoot, onComplete, onError, onMetrics })
  callbacksRef.current = { onBoot, onComplete, onError, onMetrics }

  const loadDocument = useCallback(() => {
    const message: SandboxLoadMessage = {
      channel: SANDBOX_HOST_CHANNEL,
      type: 'load',
      token: sessionId,
      html,
    }
    frameRef.current?.contentWindow?.postMessage(message, '*')
  }, [html, sessionId])

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow || !isSandboxHostEvent(event.data)) return
      if (event.data.token !== sessionId) return
      if (event.data.type === 'booted') callbacksRef.current.onBoot?.()
      if (event.data.type === 'complete') callbacksRef.current.onComplete?.()
      if (event.data.type === 'error') callbacksRef.current.onError?.(event.data.detail ?? '自定义文档运行失败')
      if (event.data.type === 'metrics' && event.data.metrics) callbacksRef.current.onMetrics?.(event.data.metrics)
    }
    window.addEventListener('message', receiveMessage)
    return () => window.removeEventListener('message', receiveMessage)
  }, [sessionId])

  useEffect(() => {
    loadDocument()
  }, [loadDocument])

  return (
    <iframe
      ref={frameRef}
      className={cn('challenge-sandbox-frame', className)}
      style={style}
      src={chrome.runtime.getURL('/sandbox.html')}
      title={title}
      onLoad={loadDocument}
    />
  )
}
