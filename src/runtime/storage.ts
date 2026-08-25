import { EMPTY_CONFIG } from '../domain/defaults'
import {
  CONFIG_SCHEMA_VERSION,
  type RuntimeState,
  type RuntimeStore,
  type StoredConfig,
} from '../domain/types'
import { validateStoredConfig } from '../domain/validation'

const CONFIG_KEY = 'pilotGuardianConfig'
const RUNTIME_KEY = 'pilotGuardianRuntime'
const PENDING_KEY = 'pilotGuardianPending'
const PROGRESS_KEY = 'pilotGuardianProgress'

export interface PendingNavigation {
  ruleId: string
  url: string
  capturedAt: number
}

type PendingStore = Record<string, PendingNavigation>
export interface ChallengeProgress {
  stepIndex: number
  sequenceSignature: string
  sessionId: string
}

type ProgressStore = Record<string, ChallengeProgress>

export async function loadConfig(): Promise<StoredConfig> {
  const stored = await chrome.storage.local.get(CONFIG_KEY)
  const raw = stored[CONFIG_KEY]
  const parsed = validateStoredConfig(raw)
  if (!parsed.ok) return structuredClone(EMPTY_CONFIG)
  return parsed.value
}

export async function saveConfig(config: StoredConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config })
}

export async function loadRuntimeStore(): Promise<RuntimeStore> {
  const stored = await chrome.storage.local.get(RUNTIME_KEY)
  const candidate = stored[RUNTIME_KEY]
  const candidateRecord = candidate as { schemaVersion?: unknown; byRuleId?: unknown } | undefined
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    candidateRecord?.schemaVersion !== CONFIG_SCHEMA_VERSION ||
    typeof candidateRecord.byRuleId !== 'object' ||
    candidateRecord.byRuleId === null ||
    Array.isArray(candidateRecord.byRuleId)
  ) {
    return { schemaVersion: CONFIG_SCHEMA_VERSION, byRuleId: {} }
  }
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    byRuleId: candidateRecord.byRuleId as Record<string, RuntimeState>,
  }
}

export async function saveRuntimeStore(runtime: RuntimeStore): Promise<void> {
  await chrome.storage.local.set({ [RUNTIME_KEY]: runtime })
}

async function loadSessionRecord<T extends Record<string, unknown>>(key: string): Promise<T> {
  const stored = await chrome.storage.session.get(key)
  const value = stored[key]
  return typeof value === 'object' && value !== null ? value as T : {} as T
}

export async function setPendingNavigation(
  tabId: number,
  pending: PendingNavigation,
): Promise<void> {
  const store = await loadSessionRecord<PendingStore>(PENDING_KEY)
  store[String(tabId)] = pending
  await chrome.storage.session.set({ [PENDING_KEY]: store })
}

export async function getPendingNavigation(tabId: number): Promise<PendingNavigation | undefined> {
  const store = await loadSessionRecord<PendingStore>(PENDING_KEY)
  return store[String(tabId)]
}

export async function clearPendingNavigation(tabId: number): Promise<void> {
  const store = await loadSessionRecord<PendingStore>(PENDING_KEY)
  delete store[String(tabId)]
  await chrome.storage.session.set({ [PENDING_KEY]: store })
}

function progressKey(tabId: number, ruleId: string): string {
  return `${tabId}:${ruleId}`
}

export async function getChallengeProgress(
  tabId: number,
  ruleId: string,
  sequenceSignature: string,
): Promise<ChallengeProgress> {
  const store = await loadSessionRecord<ProgressStore>(PROGRESS_KEY)
  const key = progressKey(tabId, ruleId)
  const current = store[key]
  if (current?.sequenceSignature === sequenceSignature && Number.isInteger(current.stepIndex)) {
    return current
  }
  const next: ChallengeProgress = {
    stepIndex: 0,
    sequenceSignature,
    sessionId: crypto.randomUUID(),
  }
  store[key] = next
  await chrome.storage.session.set({ [PROGRESS_KEY]: store })
  return next
}

export async function setChallengeProgress(
  tabId: number,
  ruleId: string,
  stepIndex: number,
  sequenceSignature: string,
): Promise<void> {
  const store = await loadSessionRecord<ProgressStore>(PROGRESS_KEY)
  store[progressKey(tabId, ruleId)] = {
    stepIndex,
    sequenceSignature,
    sessionId: crypto.randomUUID(),
  }
  await chrome.storage.session.set({ [PROGRESS_KEY]: store })
}

export async function clearChallengeProgress(tabId: number, ruleId: string): Promise<void> {
  const store = await loadSessionRecord<ProgressStore>(PROGRESS_KEY)
  delete store[progressKey(tabId, ruleId)]
  await chrome.storage.session.set({ [PROGRESS_KEY]: store })
}

export async function clearRuleChallengeProgress(ruleId: string): Promise<void> {
  const store = await loadSessionRecord<ProgressStore>(PROGRESS_KEY)
  let changed = false
  for (const key of Object.keys(store)) {
    if (!key.endsWith(`:${ruleId}`)) continue
    delete store[key]
    changed = true
  }
  if (changed) await chrome.storage.session.set({ [PROGRESS_KEY]: store })
}

export function stateForRule(
  store: RuntimeStore,
  ruleId: string,
): RuntimeState {
  return store.byRuleId[ruleId] ?? {}
}
