import type { RenderedVariant } from './types.js'

/**
 * Where a generated variant lands so it is never generated twice.
 *
 * An interface rather than a concrete cache, because the right answer differs
 * per deployment: a single Node process wants memory, a static build wants the
 * output directory, a fleet wants the object store. The default below is the one
 * that needs nothing, which is the same reasoning rule R1 applies everywhere
 * else.
 *
 * `CacheDriver` from `@cogenta/core` is deliberately *not* reused: it serialises
 * its values as JSON, and a JPEG round-tripped through JSON is no longer a JPEG.
 */
export interface VariantStore {
  get(key: string): Promise<RenderedVariant | null>
  set(key: string, variant: RenderedVariant): Promise<void>
  clear(): Promise<void>
}

export interface MemoryVariantStoreOptions {
  /** Total bytes of variants held before the least recently used are dropped. */
  readonly maxBytes?: number
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/**
 * In-process, least-recently-used, bounded by bytes rather than by entry count.
 *
 * Bounded by bytes because that is the thing that runs out: a thousand thumbnails
 * and a thousand hero images are the same number of entries and two orders of
 * magnitude apart in memory. The spec's warning about variants exploding is
 * about exactly this.
 */
export function createMemoryVariantStore(options: MemoryVariantStoreOptions = {}): VariantStore {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const entries = new Map<string, RenderedVariant>()
  let held = 0

  function drop(key: string): void {
    const existing = entries.get(key)
    if (existing === undefined) return
    held -= existing.bytes.byteLength
    entries.delete(key)
  }

  function evict(): void {
    for (const key of entries.keys()) {
      if (held <= maxBytes) return
      drop(key)
    }
  }

  return {
    get: async (key: string): Promise<RenderedVariant | null> => {
      const found = entries.get(key)
      if (found === undefined) return null
      // Re-inserting moves it to the end, which is what makes the Map an LRU.
      entries.delete(key)
      entries.set(key, found)
      return found
    },

    set: async (key: string, variant: RenderedVariant): Promise<void> => {
      drop(key)
      // A variant larger than the whole budget is served but not kept: caching
      // it would evict everything else to hold one file.
      if (variant.bytes.byteLength > maxBytes) return
      entries.set(key, variant)
      held += variant.bytes.byteLength
      evict()
    },

    clear: async (): Promise<void> => {
      entries.clear()
      held = 0
    },
  }
}
