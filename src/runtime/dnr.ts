import { evaluateRule } from '../domain/policy'
import type { RuntimeStore, StoredConfig } from '../domain/types'
import { urlPatternToDnrRegex } from '../domain/url-pattern'
import { stateForRule } from './storage'

export function buildDynamicRules(
  config: StoredConfig,
  runtime: RuntimeStore,
  now: number,
  gateUrl: string,
): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = []
  let nextDnrRuleId = 1

  for (const rule of config.rules) {
    if (!rule.enabled) continue
    const evaluation = evaluateRule(rule, stateForRule(runtime, rule.id), now)
    const priority = Math.max(1, config.rules.length - rule.priority)
    const action: chrome.declarativeNetRequest.RuleAction =
      evaluation.state === 'allowed'
        ? { type: chrome.declarativeNetRequest.RuleActionType.ALLOW }
        : {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { url: `${gateUrl}?ruleId=${encodeURIComponent(rule.id)}` },
          }

    for (const urlPattern of rule.urlPatterns) {
      rules.push({
        id: nextDnrRuleId,
        priority,
        action,
        condition: {
          regexFilter: urlPatternToDnrRegex(urlPattern),
          isUrlFilterCaseSensitive: true,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      })
      nextDnrRuleId += 1
    }
  }
  return rules
}

export async function replaceDynamicRules(
  config: StoredConfig,
  runtime: RuntimeStore,
  now: number,
): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const rules = buildDynamicRules(config, runtime, now, chrome.runtime.getURL('/gate.html'))
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules,
  })
}
