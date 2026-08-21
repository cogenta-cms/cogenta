import type { ProviderRegistryConfig } from './registry.js'
import type { ProviderConfigStore } from './store.js'

/**
 * Turns the persisted, encrypted `ProviderConfigStore` into the plaintext
 * shape `createProviderRegistry` needs — the one place a key is decrypted
 * for actual use (R7: never logged, never returned from this function's
 * caller over the wire). A provider with no saved key, or saved but
 * disabled, is simply absent from the result — exactly R2's "no provider
 * configured" state `createProviderRegistry`'s own doc comment already
 * describes.
 */
export async function resolveProviderRegistryConfig(
  store: ProviderConfigStore,
): Promise<ProviderRegistryConfig> {
  const configs = await store.list()
  const config: Record<string, { apiKey: string; model: string; baseUrl?: string }> = {}
  for (const entry of configs) {
    if (!entry.enabled) continue
    const apiKey = await store.decryptKey(entry.provider)
    config[entry.provider] = {
      apiKey,
      model: entry.model,
      ...(entry.baseUrl === undefined ? {} : { baseUrl: entry.baseUrl }),
    }
  }
  return config as ProviderRegistryConfig
}
