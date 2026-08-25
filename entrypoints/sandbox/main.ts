import {
  SANDBOX_DOCUMENT_CHANNEL,
  SANDBOX_HOST_CHANNEL,
  isSandboxDocumentEvent,
  isSandboxLoadMessage,
  type SandboxHostEvent,
} from '../../src/sandbox/protocol'
import './style.scss'

const rootElement = document.getElementById('sandbox-root')
if (!rootElement) throw new Error('Sandbox root is unavailable')
const root = rootElement

let documentFrame: HTMLIFrameElement | undefined
let activeToken = ''

function reply(type: SandboxHostEvent['type'], detail?: string): void {
  const message: SandboxHostEvent = {
    channel: SANDBOX_HOST_CHANNEL,
    type,
    token: activeToken,
    ...(detail ? { detail } : {}),
  }
  parent.postMessage(message, '*')
}

function bridgeSource(token: string): string {
  return `(() => {
    const channel = ${JSON.stringify(SANDBOX_DOCUMENT_CHANNEL)};
    const token = ${JSON.stringify(token)};
    let failed = false;
    let completed = false;
    const send = (type, detail) => parent.postMessage({ channel, type, token, ...(detail ? { detail } : {}) }, '*');
    const complete = () => {
      if (completed) return;
      completed = true;
      send('complete');
    };
    Object.defineProperty(window, 'PilotGuardian', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: Object.freeze({ complete }),
    });
    window.addEventListener('error', (event) => {
      failed = true;
      send('error', event.message || '脚本运行失败');
    });
    window.addEventListener('unhandledrejection', (event) => {
      failed = true;
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || '未处理的异步错误');
      send('error', reason);
    });
    window.addEventListener('DOMContentLoaded', () => {
      window.setTimeout(() => { if (!failed) send('booted'); }, 120);
    }, { once: true });
  })();`
}

function isolatedDocument(html: string, token: string): string {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')
  const policy = parsed.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = [
    "default-src 'none'",
    "img-src data:",
    "media-src data:",
    "font-src data:",
    "style-src 'unsafe-inline' data:",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ')
  parsed.head.prepend(policy)

  const bridge = parsed.createElement('script')
  bridge.textContent = bridgeSource(token)
  policy.after(bridge)
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`
}

function loadDocument(html: string, token: string): void {
  activeToken = token
  documentFrame?.remove()
  const frame = document.createElement('iframe')
  frame.title = '隔离的挑战文档'
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.srcdoc = isolatedDocument(html, token)
  root.replaceChildren(frame)
  documentFrame = frame
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source === parent && isSandboxLoadMessage(event.data)) {
    loadDocument(event.data.html, event.data.token)
    return
  }
  if (event.source !== documentFrame?.contentWindow || !isSandboxDocumentEvent(event.data)) return
  if (event.data.token !== activeToken) return
  reply(event.data.type, event.data.detail)
})
