import { describe, expect, it } from 'vitest'
import woodenFishHtml from './templates/wooden-fish.html?raw'
import reactionTestHtml from './templates/reaction-test.html?raw'
import type { ChallengeStep } from './types'
import { OFFICIAL_TEMPLATES, challengeHtml, officialTemplate } from './challenge-templates'

const PG_PARAMS_REGEX = /<script\s+type="application\/json"\s+id="pg-params">([\s\S]*?)<\/script>/g

function readParams(html: string): Record<string, unknown> {
  const matches = [...html.matchAll(PG_PARAMS_REGEX)]
  expect(matches).toHaveLength(1)
  return JSON.parse(matches[0]![1]!) as Record<string, unknown>
}

describe('OFFICIAL_TEMPLATES registry', () => {
  it('exposes each template with inline html that ships in the bundle', () => {
    expect(OFFICIAL_TEMPLATES.map((template) => template.id)).toEqual(['wooden-fish', 'reaction-test'])
    for (const template of OFFICIAL_TEMPLATES) {
      expect(typeof template.html).toBe('string')
      expect(template.html.length).toBeGreaterThan(0)
    }
  })

  it('every official template embeds exactly one #pg-params with finite numeric defaults', () => {
    for (const template of OFFICIAL_TEMPLATES) {
      const matches = [...template.html.matchAll(PG_PARAMS_REGEX)]
      expect(matches, `${template.id} 应恰好包含一个 #pg-params`).toHaveLength(1)

      const defaults = JSON.parse(matches[0]![1]!) as Record<string, unknown>
      expect(Object.keys(defaults).length).toBeGreaterThan(0)
      for (const [key, value] of Object.entries(defaults)) {
        expect(typeof value, `${template.id}.${key} 应为 number`).toBe('number')
        expect(Number.isFinite(value), `${template.id}.${key} 应为有限数字`).toBe(true)
      }
    }
  })

  it('every official template reads parameters from #pg-params at boot', () => {
    for (const template of OFFICIAL_TEMPLATES) {
      expect(template.html).toContain("JSON.parse(document.getElementById('pg-params').textContent)")
    }
  })

  it('every official template calls window.PilotGuardian.complete on success', () => {
    // 官方模板必须能被 sandbox 正确终结,这是接入底线。
    for (const template of OFFICIAL_TEMPLATES) {
      expect(template.html).toContain('window.PilotGuardian.complete()')
    }
  })
})

describe('officialTemplate', () => {
  it('returns the registered template by id', () => {
    expect(officialTemplate('wooden-fish').name).toBe('静心木鱼')
    expect(officialTemplate('reaction-test').name).toBe('反应力测试')
  })

  it('returns the same html that ships in OFFICIAL_TEMPLATES', () => {
    expect(officialTemplate('wooden-fish').html).toBe(woodenFishHtml)
    expect(officialTemplate('reaction-test').html).toBe(reactionTestHtml)
  })
})

describe('challengeHtml', () => {
  it('returns the custom html untouched for interactive custom documents', () => {
    const step: Extract<ChallengeStep, { type: 'interactive' }> = {
      id: 'step-2',
      type: 'interactive',
      source: {
        kind: 'custom',
        document: { html: '<div>custom</div>', reviewState: 'ready' },
      },
    }
    expect(challengeHtml(step)).toBe('<div>custom</div>')
  })

  it('returns the official template html when interactive document is copied from a preset', () => {
    const step: Extract<ChallengeStep, { type: 'interactive' }> = {
      id: 'step-preset',
      type: 'interactive',
      source: {
        kind: 'custom',
        document: { html: officialTemplate('wooden-fish').html, reviewState: 'ready' },
      },
    }
    expect(challengeHtml(step)).toBe(woodenFishHtml)
    expect(readParams(challengeHtml(step)!)).toEqual({ requiredHits: 10 })
  })

  it('returns undefined for a default text step', () => {
    const step: Extract<ChallengeStep, { type: 'text' }> = {
      id: 'step-3',
      type: 'text',
      answer: 'secret',
      scene: { kind: 'default' },
    }
    expect(challengeHtml(step)).toBeUndefined()
  })

  it('returns the embedded html for a custom text scene', () => {
    const step: Extract<ChallengeStep, { type: 'text' }> = {
      id: 'step-4',
      type: 'text',
      answer: 'secret',
      scene: { kind: 'custom', document: { html: '<p>scene</p>', reviewState: 'ready' } },
    }
    expect(challengeHtml(step)).toBe('<p>scene</p>')
  })
})
