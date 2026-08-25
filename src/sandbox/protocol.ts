export const SANDBOX_HOST_CHANNEL = 'pilot-guardian:sandbox-host'
export const SANDBOX_DOCUMENT_CHANNEL = 'pilot-guardian:sandbox-document'

export interface SandboxMetrics {
  contentWidth: number
  contentHeight: number
  viewportWidth: number
  viewportHeight: number
  overflowX: boolean
  overflowY: boolean
}

export interface SandboxLoadMessage {
  channel: typeof SANDBOX_HOST_CHANNEL
  type: 'load'
  token: string
  html: string
}

export interface SandboxHostEvent {
  channel: typeof SANDBOX_HOST_CHANNEL
  type: 'booted' | 'complete' | 'error' | 'metrics'
  token: string
  detail?: string
  metrics?: SandboxMetrics
}

export interface SandboxDocumentEvent {
  channel: typeof SANDBOX_DOCUMENT_CHANNEL
  type: 'booted' | 'complete' | 'error' | 'metrics'
  token: string
  detail?: string
  metrics?: SandboxMetrics
}

export function isSandboxHostEvent(value: unknown): value is SandboxHostEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<SandboxHostEvent>
  return event.channel === SANDBOX_HOST_CHANNEL &&
    (event.type === 'booted' || event.type === 'complete' || event.type === 'error' || event.type === 'metrics') &&
    typeof event.token === 'string'
}

export function isSandboxLoadMessage(value: unknown): value is SandboxLoadMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Partial<SandboxLoadMessage>
  return message.channel === SANDBOX_HOST_CHANNEL && message.type === 'load' &&
    typeof message.token === 'string' && typeof message.html === 'string'
}

export function isSandboxDocumentEvent(value: unknown): value is SandboxDocumentEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<SandboxDocumentEvent>
  return event.channel === SANDBOX_DOCUMENT_CHANNEL &&
    (event.type === 'booted' || event.type === 'complete' || event.type === 'error' || event.type === 'metrics') &&
    typeof event.token === 'string'
}
