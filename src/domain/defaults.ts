import type { AccessRule, StoredConfig } from './types'
import { CONFIG_SCHEMA_VERSION } from './types'

export const EMPTY_CONFIG: StoredConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  rules: [],
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
    challenges: [
      {
        id: crypto.randomUUID(),
        prompt: '请输入口令',
        answer: '',
      },
    ],
    accessDurationMinutes: 30,
  }
}
