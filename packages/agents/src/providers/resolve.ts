import type { ImageProviderRegistryConfig } from './image/registry.js'
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
  const config: Record<
    string,
    {
      apiKey: string
      model: string
      baseUrl?: string
      maxOutputTokens?: number
      requestTimeoutMs?: number
      maxCorrectionAttempts?: number
    }
  > = {}
  for (const entry of configs) {
    if (!entry.enabled) continue
    const apiKey = await store.decryptKey(entry.provider)
    config[entry.provider] = {
      apiKey,
      model: entry.model,
      ...(entry.baseUrl === undefined ? {} : { baseUrl: entry.baseUrl }),
      ...(entry.maxOutputTokens === undefined ? {} : { maxOutputTokens: entry.maxOutputTokens }),
      ...(entry.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: entry.requestTimeoutMs }),
      ...(entry.maxCorrectionAttempts === undefined
        ? {}
        : { maxCorrectionAttempts: entry.maxCorrectionAttempts }),
    }
  }
  return config as ProviderRegistryConfig
}

/**
 * The same store, read for the *image* half of what a vendor can do.
 *
 * A multimodal vendor is one entry, not two: it shares an API key and a base
 * URL, and simply declares a second model name. So capability is derived —
 * an entry with an `imageModel` can render images, one without cannot — and
 * a record can never contradict itself by claiming a capability it has no
 * model for.
 *
 * Silently skips a vendor `createImageProviderRegistry` has no client for:
 * the text registry accepts any provider id, while images are served by a
 * closed set of two, and an entry naming a third is a text-only provider
 * that happens to have an image model typed into it — not a reason to fail
 * the whole resolution (R2's "a missing ingredient degrades a feature").
 */
export async function resolveImageProviderRegistryConfig(
  store: ProviderConfigStore,
): Promise<ImageProviderRegistryConfig> {
  const configs = await store.list()
  const config: {
    openai?: { apiKey: string; model: string; baseUrl?: string }
    stability?: { apiKey: string; model: string; baseUrl?: string }
  } = {}

  for (const entry of configs) {
    if (!entry.enabled) continue
    if (entry.imageModel === undefined || entry.imageModel === '') continue
    if (entry.provider !== 'openai' && entry.provider !== 'stability') continue
    const apiKey = await store.decryptKey(entry.provider)
    config[entry.provider] = {
      apiKey,
      model: entry.imageModel,
      // Deliberately NOT `entry.baseUrl`: on both image clients `baseUrl` is
      // the full endpoint (`…/v1/images/generations`), and the text one is a
      // different full endpoint (chat completions). Reusing it would POST an
      // image payload at a chat URL. A proxy that needs overriding sets
      // `imageBaseUrl` instead.
      ...(entry.imageBaseUrl === undefined ? {} : { baseUrl: entry.imageBaseUrl }),
    }
  }

  return config
}
