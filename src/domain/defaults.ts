import type {
  AccessRule,
  ChallengeStep,
  DailyWindow,
  InteractiveChallengeStep,
  StoredConfig,
  TextChallengeStep,
} from './types'
import { CONFIG_SCHEMA_VERSION } from './types'
import { officialTemplate } from './challenge-templates'

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

export function createTextChallenge(): TextChallengeStep {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    answer: '',
    scene: { kind: 'default' },
  }
}

export function createInteractiveChallenge(): InteractiveChallengeStep {
  return {
    id: crypto.randomUUID(),
    type: 'interactive',
    source: {
      kind: 'custom',
      document: { html: officialTemplate('wooden-fish').html, reviewState: 'ready' },
    },
  }
}

export function createChallenge(type: ChallengeStep['type']): ChallengeStep {
  return type === 'text' ? createTextChallenge() : createInteractiveChallenge()
}

export const DEFAULT_DAILY_WINDOW: DailyWindow = { startMinutes: 20 * 60, endMinutes: 23 * 60 }

export function createDefaultRule(): AccessRule {
  return {
    id: crypto.randomUUID(),
    name: '新的访问规则',
    enabled: true,
    priority: 0,
    urlPatterns: [''],
    mode: 'password',
    challenges: [createTextChallenge()],
    accessDurationMinutes: 30,
  }
}
