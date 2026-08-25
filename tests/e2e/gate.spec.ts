import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test, type BrowserContext } from '@playwright/test'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const extensionPath = path.join(projectRoot, '.output', 'chrome-mv3')

function chromeExecutable(): string {
  if (process.platform !== 'win32') return '/usr/bin/google-chrome'
  const programFiles = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
  return path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')
}

async function extensionId(context: BrowserContext): Promise<string> {
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent('serviceworker')
  return new URL(worker.url()).host
}

function launchExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    executablePath: chromeExecutable(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })
}

test('依次完成自定义文本场景与官方交互模板后恢复原 URL', async () => {
  let server: Server | undefined
  let targetRequests = 0
  let blockedSubresourceRequests = 0
  const port = await new Promise<number>((resolve) => {
    server = createServer((request, response) => {
      if (request.url?.startsWith('/focus')) targetRequests += 1
      if (request.url?.startsWith('/leak')) blockedSubresourceRequests += 1
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<title>目标页面</title><h1>已到达目标</h1>')
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })

  const context = await launchExtension()

  try {
    const id = await extensionId(context)
    const options = await context.newPage()
    await options.goto(`chrome-extension://${id}/options.html`)
    await expect(options.getByRole('heading', { name: '访问航线控制台' })).toBeVisible()
    const targetUrl = `http://127.0.0.1:${port}/focus?q=1#kept`
    await options.evaluate(async (testPort) => {
      const response = await chrome.runtime.sendMessage({
        type: 'config:save',
        rules: [{
          id: 'e2e-rule',
          dnrRuleId: 91,
          name: '端到端目标',
          enabled: true,
          priority: 0,
          target: {
            schemes: ['http'],
            host: '127.0.0.1',
            includeSubdomains: false,
            path: '/focus*',
          },
          mode: 'password',
          challenges: [
            {
              id: 'text-step',
              type: 'text',
              answer: '起飞许可',
              scene: {
                kind: 'custom',
                document: {
                  html: `<!doctype html><html><body><h1>自定义背景已加载</h1><script>fetch('http://127.0.0.1:${testPort}/leak')</script></body></html>`,
                  reviewState: 'ready',
                },
              },
            },
            {
              id: 'interactive-step',
              type: 'interactive',
              source: {
                kind: 'custom',
                document: {
                  html: `<!doctype html>
<html><head><meta charset="utf-8">
<script type="application/json" id="pg-params">{"requiredHits":3}</script>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;font-family:sans-serif;background:#eef;color:#102}button{padding:1rem 2rem;font:inherit;cursor:pointer}</style>
</head><body>
<button id="hit">敲击 (<span id="count">0</span>/3)</button>
<script>
  const { requiredHits } = JSON.parse(document.getElementById('pg-params').textContent);
  const btn = document.getElementById('hit');
  const count = document.getElementById('count');
  let hits = 0;
  btn.addEventListener('click', () => {
    if (hits >= requiredHits) return;
    hits += 1;
    count.textContent = String(hits);
    if (hits === requiredHits) window.setTimeout(() => window.PilotGuardian.complete(), 200);
  });
</script>
</body></html>`,
                  reviewState: 'ready',
                },
              },
            },
          ],
          accessDurationMinutes: 30,
        }],
      })
      if (!response.ok) throw new Error(JSON.stringify(response))
    }, port)
    const unauthorizedGateResponse = await options.evaluate(async () => chrome.runtime.sendMessage({
      type: 'gate:get-context',
      ruleId: 'e2e-rule',
    })) as { __pilotGuardianError?: string }
    expect(unauthorizedGateResponse.__pilotGuardianError).toContain('权限')

    const page = await context.newPage()
    await page.goto(targetUrl)
    await expect(page).toHaveURL(new RegExp(`chrome-extension://${id}/gate\\.html`))
    expect(targetRequests).toBe(0)
    const scene = page
      .frameLocator('iframe[title*="自定义挑战场景"]')
      .frameLocator('iframe[title="隔离的挑战文档"]')
    await expect(scene.getByRole('heading', { name: '自定义背景已加载' })).toBeVisible()
    await page.waitForTimeout(200)
    expect(blockedSubresourceRequests).toBe(0)
    await page.getByLabel('口令').fill('错误口令')
    await page.getByRole('button', { name: '确认口令' }).click()
    await expect(page.getByRole('alert')).toContainText('口令不正确')
    await expect(page).toHaveURL(new RegExp(`chrome-extension://${id}/gate\\.html`))
    await page.getByLabel('口令').fill('起飞许可')
    await page.getByRole('button', { name: '确认口令' }).click()
    await expect(page.getByRole('progressbar', { name: '挑战进度 2 / 2' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('progressbar', { name: '挑战进度 2 / 2' })).toBeVisible()
    const interactive = page
      .frameLocator('iframe[title*="交互挑战"]')
      .frameLocator('iframe[title="隔离的挑战文档"]')
    const woodenFish = interactive.getByRole('button', { name: '敲击木鱼' })
    await woodenFish.click()
    await woodenFish.click()
    await woodenFish.click()
    await expect(page).toHaveURL(targetUrl)
    await expect(page.getByRole('heading', { name: '已到达目标' })).toBeVisible()
    expect(targetRequests).toBe(1)
  } finally {
    await context.close()
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => error ? reject(error) : resolve())
    })
  }
})

test('自定义交互文档通过沙箱预览后才能保存', async () => {
  const context = await launchExtension()
  try {
    const id = await extensionId(context)
    const options = await context.newPage()
    await options.goto(`chrome-extension://${id}/options.html`)
    await options.getByLabel('规则编辑器').getByRole('button', { name: '新建规则' }).click()
    await options.getByText('交互挑战', { exact: true }).click()
    await expect(options.getByRole('alertdialog')).toContainText('当前步骤中不兼容的答案')
    await options.getByRole('button', { name: '确认切换' }).click()
    await options.getByRole('button', { name: '复制为自定义代码' }).click()
    await expect(options.getByText('需要预览', { exact: true })).toBeVisible()

    await options.getByRole('button', { name: '保存配置' }).click()
    await expect(options.locator('.mission-alert')).toContainText('必须成功运行沙箱预览')

    await options.getByRole('button', { name: '运行沙箱预览' }).click()
    await expect(options.getByText('已通过预览', { exact: true })).toBeVisible()
    await options.getByRole('button', { name: '保存配置' }).click()
    await expect(options.getByText('配置已保存', { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})
