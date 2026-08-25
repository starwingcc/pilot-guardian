import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_SCHEMA_VERSION } from '../domain/types'
import { loadConfig, loadRuntimeStore } from './storage'

const get = vi.fn()
const set = vi.fn()

describe('配置存储版本校验', () => {
  beforeEach(() => {
    get.mockReset()
    set.mockReset()
    set.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', {
      storage: {
        local: { get, set },
        session: { get: vi.fn(), set: vi.fn() },
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('读取不兼容配置时回退为空配置且不回写', async () => {
    get.mockResolvedValue({
      pilotGuardianConfig: { schemaVersion: 2, rules: [] },
    })

    const config = await loadConfig()

    expect(config).toEqual({ schemaVersion: CONFIG_SCHEMA_VERSION, rules: [] })
    expect(set).not.toHaveBeenCalled()
  })

  it('读取不兼容 runtime 时丢弃旧状态', async () => {
    get.mockResolvedValue({
      pilotGuardianRuntime: {
        schemaVersion: 2,
        byRuleId: { 'legacy-rule': { activeUntil: 1_900_000_000_000 } },
      },
    })

    const runtime = await loadRuntimeStore()

    expect(runtime).toEqual({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      byRuleId: {},
    })
  })
})
