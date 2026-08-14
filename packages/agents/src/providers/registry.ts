import { CogentaError } from '@cogenta/core'
import { createAnthropicClient } from './anthropic.js'
import { createGoogleClient } from './google.js'
import { createOpenAiClient } from './openai.js'
import type { ProviderClient } from './types.js'

export const PROVIDER_NAMES = ['anthropic', 'openai', 'google'] as const
export type ProviderName = (typeof PROVIDER_NAMES)[number]

export interface ProviderRegistryConfig {
  readonly anthropic?: {
    readonly apiKey: string
    readonly model: string
    readonly baseUrl?: string
  }
  readonly openai?: { readonly apiKey: string; readonly model: string; readonly baseUrl?: string }
  readonly google?: { readonly apiKey: string; readonly model: string; readonly baseUrl?: string }
}

/**
 * One client per configured vendor — a site with no LLM provider configured
 * simply has an empty registry, which is exactly what rule R2 requires ("le
 * CMS fonctionne sans IA"): nothing here fails to construct, `get()` is what
 * refuses, and only once an agent actually tries to run.
 */
export function createProviderRegistry(config: ProviderRegistryConfig): {
  readonly get: (name: ProviderName) => ProviderClient
  readonly has: (name: ProviderName) => boolean
} {
  const clients = new Map<ProviderName, ProviderClient>()
  if (config.anthropic !== undefined)
    clients.set('anthropic', createAnthropicClient(config.anthropic))
  if (config.openai !== undefined) clients.set('openai', createOpenAiClient(config.openai))
  if (config.google !== undefined) clients.set('google', createGoogleClient(config.google))

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
