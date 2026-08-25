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

test('在目标文档执行前展示闸门，并在口令通过后恢复原 URL', async () => {
  let server: Server | undefined
  let targetRequests = 0
  const port = await new Promise<number>((resolve) => {
    server = createServer((request, response) => {
      if (request.url?.startsWith('/focus')) targetRequests += 1
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<title>目标页面</title><h1>已到达目标</h1>')
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })

  const context = await chromium.launchPersistentContext('', {
    executablePath: chromeExecutable(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  try {
    const id = await extensionId(context)
    const options = await context.newPage()
    await options.goto(`chrome-extension://${id}/options.html`)
    await expect(options.getByRole('heading', { name: '访问航线控制台' })).toBeVisible()
    const targetUrl = `http://127.0.0.1:${port}/focus?q=1#kept`
    await options.evaluate(async () => {
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
          challenges: [{ id: 'step', answer: 'fly' }],
          accessDurationMinutes: 30,
        }],
      })
      if (!response.ok) throw new Error(JSON.stringify(response))
    })

    const page = await context.newPage()
    await page.goto(targetUrl)
    await expect(page).toHaveURL(new RegExp(`chrome-extension://${id}/gate\\.html`))
    expect(targetRequests).toBe(0)
    await expect(page.getByRole('heading', { name: '端到端目标' })).toBeVisible()
    await page.getByLabel('测试口令').fill('wrong')
    await page.getByRole('button', { name: '确认口令' }).click()
    await expect(page.getByRole('alert')).toContainText('口令不正确')
    await expect(page).toHaveURL(new RegExp(`chrome-extension://${id}/gate\\.html`))
    await page.getByLabel('测试口令').fill('fly')
    await page.getByRole('button', { name: '确认口令' }).click()
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
