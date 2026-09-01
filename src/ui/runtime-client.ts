import type { RuntimeRequest } from '../runtime/messages'

export async function sendRuntimeMessage<T>(request: RuntimeRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage<
    RuntimeRequest,
    T & { __pilotGuardianError?: string }
  >(request)
  if (response && typeof response === 'object' && response.__pilotGuardianError) {
    throw new Error(response.__pilotGuardianError)
  }
  return response
}
