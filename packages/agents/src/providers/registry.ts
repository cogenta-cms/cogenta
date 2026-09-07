import { CogentaError } from '@cogenta/core'
import { createAnthropicClient } from './anthropic.js'
import { findProviderCatalogEntry } from './catalog.js'
import type { ProviderTuningDefaults } from './defaults.js'
import { createGoogleClient } from './google.js'
import { createOpenAiClient } from './openai.js'
import type { ProviderClient } from './types.js'

/**
 * Fiche 56: `provider` used to be a closed 3-literal union
 * (`'anthropic' | 'openai' | 'google'`) — every fourth vendor (OpenRouter,
 * DeepSeek, Qwen, GLM, a self-hosted OpenAI-compatible endpoint) needed a
 * code change to even be expressible. It is now a plain string, validated at
 * the write boundary (`store.ts`'s `upsert` and the `/api/providers` router),
 * not by a type. `@cogenta/core`'s own `llmSchema.provider` was already a
 * free string before this fiche — this only catches the registry up to a
 * looseness the config schema already had.
 */
export type ProviderName = string

export interface ProviderEntryConfig {
  readonly apiKey: string
  readonly model: string
  /**
   * Overrides `catalog.ts`'s `defaultBaseUrl` for a known provider (e.g. a
   * self-hosted proxy in front of OpenAI), or — for a provider id absent
   * from the catalog entirely — is what makes it resolvable at all: an
   * unknown id with no `baseUrl` cannot be turned into a client (see
   * `buildClient` below).
   */
  readonly baseUrl?: string
  /** See `ProviderClient.maxOutputTokens` — the admin's value for this provider, or absent to fall back to the registry's own `defaults`. */
  readonly maxOutputTokens?: number
  /** See `ProviderClient.requestTimeoutMs`. */
  readonly requestTimeoutMs?: number
  /** See `ProviderClient.maxCorrectionAttempts`. */
  readonly maxCorrectionAttempts?: number
}

export type ProviderRegistryConfig = Readonly<Record<string, ProviderEntryConfig>>

/**
 * One provider entry → one client. A catalog id picks the adapter
 * (`wireFormat`); a name the catalog does not know is only usable if the
 * entry carries its own `baseUrl` — that is what "custom OpenAI-compatible
 * endpoint" means structurally, not a separate `custom: true` flag to keep
 * in sync with this lookup.
 */
function buildClient(
  name: string,
  entry: ProviderEntryConfig,
  defaults: ProviderTuningDefaults,
): ProviderClient {
  const catalogEntry = findProviderCatalogEntry(name)
  const tuning = {
    ...(entry.maxOutputTokens === undefined ? {} : { maxOutputTokens: entry.maxOutputTokens }),
    ...(entry.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: entry.requestTimeoutMs }),
    ...(entry.maxCorrectionAttempts === undefined
      ? {}
      : { maxCorrectionAttempts: entry.maxCorrectionAttempts }),
  }

  if (catalogEntry?.wireFormat === 'anthropic') {
    return createAnthropicClient({
      apiKey: entry.apiKey,
      model: entry.model,
      ...(entry.baseUrl === undefined ? {} : { baseUrl: entry.baseUrl }),
      ...tuning,
      defaults,
    })
  }
  if (catalogEntry?.wireFormat === 'google') {
    return createGoogleClient({
      apiKey: entry.apiKey,
      model: entry.model,
      ...(entry.baseUrl === undefined ? {} : { baseUrl: entry.baseUrl }),
      ...tuning,
      defaults,
    })
  }

  // `wireFormat: 'openai-compatible'` (OpenAI itself, OpenRouter, DeepSeek,
  // Qwen, GLM) and any id absent from the catalog share this one branch —
  // exactly the "zero new network code" the fiche asks for.
  const baseUrl = entry.baseUrl ?? catalogEntry?.defaultBaseUrl
  if (baseUrl === undefined) {
    throw new CogentaError({
      code: 'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
      message: `"${name}" is not a built-in provider and has no "baseUrl" configured.`,
      hint: 'Set a baseUrl for a custom OpenAI-compatible endpoint, or use a catalog provider id.',
    })
  }
  return createOpenAiClient({
    apiKey: entry.apiKey,
    model: entry.model,
    baseUrl,
    name,
    ...(catalogEntry?.supportsVision === undefined
      ? {}
      : { supportsVision: catalogEntry.supportsVision }),
    ...tuning,
    defaults,
  })
}

/**
 * One client per configured vendor — a site with no LLM provider configured
 * simply has an empty registry, which is exactly what rule R2 requires ("le
 * CMS fonctionne sans IA"): nothing here fails to construct, `get()` is what
 * refuses, and only once an agent actually tries to run.
 *
 * `defaults` is the site-wide tuning floor (`resolveProviderTuningDefaults`,
 * `assistant.*` site settings) every entry's own per-provider override falls
 * back to — required, so no adapter this registry builds can ever fall back
 * to a hardcoded constant instead.
 */
export function createProviderRegistry(
  config: ProviderRegistryConfig,
  defaults: ProviderTuningDefaults,
): {
  readonly get: (name: string) => ProviderClient
  readonly has: (name: string) => boolean
} {
  const clients = new Map<string, ProviderClient>()
  for (const [name, entry] of Object.entries(config)) {
    clients.set(name, buildClient(name, entry, defaults))
  }

  return {
    has: (name) => clients.has(name),
    get(name) {
      const client = clients.get(name)
      if (client === undefined) {
        throw new CogentaError({
          code: 'PROVIDER_UNKNOWN',
          message: `No provider named "${name}" is configured for this site.`,
          hint: 'Set the matching COGENTA_*_API_KEY, or choose a configured provider.',
        })
      }
      return client
    },
  }
}
