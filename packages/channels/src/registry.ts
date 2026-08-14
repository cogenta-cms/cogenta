import { CogentaError } from '@cogenta/core'
import type { ChannelAdapter } from './adapter.js'

export interface ChannelRegistry {
  readonly has: (name: string) => boolean
  readonly get: (name: string) => ChannelAdapter
  /** Every configured adapter, in the order given to `createChannelRegistry`. */
  readonly list: () => readonly ChannelAdapter[]
}

/**
 * A site with zero channels configured must work fine — nothing here fails
 * to construct on an empty list, mirroring how `createProviderRegistry`
 * (`@cogenta/agents`) treats zero LLM providers as a normal, supported
 * state rather than an error (R2's spirit applied to channels: no channel
 * configured means no notifications are sent, never a broken CMS).
 */
export function createChannelRegistry(adapters: readonly ChannelAdapter[]): ChannelRegistry {
  const byName = new Map<string, ChannelAdapter>()
  for (const adapter of adapters) {
    if (byName.has(adapter.name)) {
      throw new CogentaError({
        code: 'CHANNEL_DUPLICATE',
        message: `Two channel adapters are both named "${adapter.name}".`,
        hint: 'Every ChannelAdapter passed to createChannelRegistry must have a unique name.',
        details: { name: adapter.name },
      })
    }
    byName.set(adapter.name, adapter)
  }

  return {
    has: (name) => byName.has(name),
    get(name) {
      const adapter = byName.get(name)
      if (adapter === undefined) {
        throw new CogentaError({
          code: 'CHANNEL_UNKNOWN',
          message: `No channel adapter named "${name}" is configured for this site.`,
          hint: 'Configure the channel, or send through one that is already configured.',
          details: { name },
        })
      }
      return adapter
    },
    list: () => [...byName.values()],
  }
}
