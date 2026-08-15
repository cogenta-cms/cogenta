import { CogentaError } from '@cogenta/core'
import { createOpenAiImageClient } from './openai.js'
import { createStabilityImageClient } from './stability.js'
import type { ImageProviderClient } from './types.js'

export const IMAGE_PROVIDER_NAMES = ['openai', 'stability'] as const
export type ImageProviderName = (typeof IMAGE_PROVIDER_NAMES)[number]

export interface ImageProviderRegistryConfig {
  readonly openai?: { readonly apiKey: string; readonly model: string; readonly baseUrl?: string }
  readonly stability?: {
    readonly apiKey: string
    readonly model: string
    readonly baseUrl?: string
  }
}

export interface ImageProviderRegistry {
  readonly names: readonly ImageProviderName[]
  readonly has: (name: ImageProviderName) => boolean
  readonly get: (name: ImageProviderName) => ImageProviderClient
  /** The first configured provider, or `null` for a site that configured none. */
  readonly first: () => ImageProviderClient | null
}

/**
 * One client per configured vendor, exactly as `createProviderRegistry` does for
 * text. A site with no image vendor gets an empty registry: nothing here fails
 * to construct, `first()` answers `null`, and the image tool is simply never
 * built (R2).
 */
export function createImageProviderRegistry(
  config: ImageProviderRegistryConfig,
): ImageProviderRegistry {
  const clients = new Map<ImageProviderName, ImageProviderClient>()
  if (config.openai !== undefined) {
    clients.set('openai', createOpenAiImageClient(config.openai))
  }
  if (config.stability !== undefined) {
    clients.set('stability', createStabilityImageClient(config.stability))
  }

  return {
    names: [...clients.keys()],
    has: (name) => clients.has(name),
    first: () => [...clients.values()][0] ?? null,
    get(name) {
      const client = clients.get(name)
      if (client === undefined) {
        throw new CogentaError({
          code: 'PROVIDER_UNKNOWN',
          message: `No image provider named "${name}" is configured for this site.`,
          hint: 'Set the matching API key in the environment, or choose a configured provider.',
        })
      }
      return client
    },
  }
}
