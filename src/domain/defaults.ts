import type {
  AccessRule,
  ChallengeStep,
  InteractiveChallengeStep,
  OfficialTemplateSource,
  StoredConfig,
  TextChallengeStep,
} from './types'
import { CONFIG_SCHEMA_VERSION } from './types'

export const EMPTY_CONFIG: StoredConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  rules: [],
}

export const DEFAULT_CUSTOM_DOCUMENT = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #eef5f2; color: #10201c; }
    .scene { max-width: 42rem; padding: 3rem; text-align: center; }
  </style>
</head>
<body>
  <main class="scene">
    <p>在这里设计你的挑战场景</p>
  </main>
</body>
</html>`

export const DEFAULT_INTERACTIVE_DOCUMENT = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #eef5f2; color: #10201c; }
    button { border: 0; border-radius: 999px; padding: 1rem 1.5rem; background: #183c30; color: white; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
  <button id="complete" type="button">完成挑战</button>
  <script>
    document.getElementById('complete').addEventListener('click', () => {
      window.PilotGuardian.complete();
    });
  </script>
</body>
</html>`

export function createTextChallenge(): TextChallengeStep {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    answer: '',
    scene: { kind: 'default' },
  }
}

export function defaultTemplateSource(templateId: OfficialTemplateSource['templateId']): OfficialTemplateSource {
  if (templateId === 'wooden-fish') {
    return { kind: 'template', templateId, parameters: { requiredHits: 3 } }
  }
  return {
    kind: 'template',
    templateId,
    parameters: {
      minimumDelayMs: 1_500,
      maximumDelayMs: 4_000,
      successWindowMs: 600,
    },
  }
}

export function createInteractiveChallenge(): InteractiveChallengeStep {
  return {
    id: crypto.randomUUID(),
    type: 'interactive',
    source: defaultTemplateSource('wooden-fish'),
  }
}

export function createChallenge(type: ChallengeStep['type']): ChallengeStep {
  return type === 'text' ? createTextChallenge() : createInteractiveChallenge()
}

export function createDefaultRule(dnrRuleId: number): AccessRule {
  return {
    id: crypto.randomUUID(),
    dnrRuleId,
    name: '新的访问规则',
    enabled: true,
    priority: 0,
    target: {
      schemes: ['https'],
      host: 'www.baidu.com',
      includeSubdomains: false,
      path: '/*',
    },
    mode: 'password',
    challenges: [createTextChallenge()],
    accessDurationMinutes: 30,
  }
}
