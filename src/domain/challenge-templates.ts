import type { ChallengeStep, PublicGateChallengeStep } from './types'
import woodenFishHtml from './templates/wooden-fish.html?raw'
import reactionTestHtml from './templates/reaction-test.html?raw'

/**
 * 官方模板仓库。一个文件 + 一行注册 = 接入一个模板。
 *
 * 模板自身是完全自足的静态 HTML 页:参数通过 <script id="pg-params"> 内嵌 JSON
 * 提供,模板启动时 JSON.parse 读取。规则选中模板后,HTML 会被原样拷入规则的
 * 自定义文档,之后模板演化不再影响已使用的规则。
 */
export const OFFICIAL_TEMPLATES = [
  {
    id: 'wooden-fish',
    name: '静心木鱼',
    description: '通过有节奏的点击完成一次短暂的注意力回收。',
    html: woodenFishHtml,
  },
  {
    id: 'reaction-test',
    name: '反应力测试',
    description: '等待信号出现，并在限定时间内完成点击。',
    html: reactionTestHtml,
  },
] as const

export type OfficialTemplateId = (typeof OFFICIAL_TEMPLATES)[number]['id']

export function officialTemplate(id: OfficialTemplateId): (typeof OFFICIAL_TEMPLATES)[number] {
  const template = OFFICIAL_TEMPLATES.find((candidate) => candidate.id === id)
  if (!template) throw new Error(`未注册的官方模板:${id}`)
  return template
}

export function challengeHtml(step: ChallengeStep | PublicGateChallengeStep): string | undefined {
  if (step.type === 'text') {
    return step.scene.kind === 'custom' ? step.scene.document.html : undefined
  }
  return step.source.document.html
}
