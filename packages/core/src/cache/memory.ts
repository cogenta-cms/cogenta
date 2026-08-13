import type { Driver, HealthReport } from '../drivers/index.js'
import { assertKey, deserialise, expiryFrom, isExpired, serialise } from './entry.js'
import type { CacheConfig, CacheDriver, CacheDriverOptions, CacheSetOptions } from './types.js'

interface StoredEntry {
  /** Serialised, never the caller's object: see the note on `CacheDriver`. */
  readonly raw: string
  readonly expiresAt: number | null
  readonly tags: readonly string[]
}

/**
 * In-process cache. The last line of defence: it needs nothing at all, so it is
 * what a site falls back to when there is neither Redis nor a writable cache
 * directory. Its contents die with the process, which is correct — a cache is
 * never a source of truth.
 */
export function createMemoryCache(options: CacheDriverOptions = {}): CacheDriver {
  const now = options.now ?? Date.now
  const entries = new Map<string, StoredEntry>()
  const byTag = new Map<string, Set<string>>()

  function forget(key: string): void {
    const entry = entries.get(key)
    if (entry === undefined) return

    for (const tag of entry.tags) {
      const keys = byTag.get(tag)
      if (keys === undefined) continue
      keys.delete(key)
      if (keys.size === 0) byTag.delete(tag)
    }
    entries.delete(key)
  }

  return {
    get: async <T>(key: string): Promise<T | null> => {
      assertKey(key)
      const entry = entries.get(key)
      if (entry === undefined) return null

      if (isExpired(entry.expiresAt, now())) {
        forget(key)
        return null
      }
      return deserialise(entry.raw) as T
    },

    set: async <T>(key: string, value: T, setOptions?: CacheSetOptions): Promise<void> => {
      assertKey(key)
      const raw = serialise(value)
      const expiresAt = expiryFrom(setOptions?.ttl, now())
      const tags = [...new Set(setOptions?.tags ?? [])]

      forget(key)
      entries.set(key, { raw, expiresAt, tags })

      for (const tag of tags) {
        const keys = byTag.get(tag) ?? new Set<string>()
        keys.add(key)
        byTag.set(tag, keys)
      }
    },

    delete: async (key: string): Promise<void> => {
      assertKey(key)
      forget(key)
    },

    invalidateTags: async (tags: readonly string[]): Promise<void> => {
      for (const tag of tags) {
        for (const key of byTag.get(tag) ?? []) forget(key)
      }
    },

    clear: async (): Promise<void> => {
      entries.clear()
      byTag.clear()
    },
  }
}

export function memoryCacheDriver(
  options: CacheDriverOptions = {},
): Driver<CacheDriver, CacheConfig> {
  let instance: CacheDriver | undefined

  return {
    name: 'memory',
    tier: 'degraded',
    available: async () => true,
    init: async () => {
      instance ??= createMemoryCache(options)
      return instance
    },
    dispose: async () => {
      await instance?.clear()
      instance = undefined
    },
    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'memory',
      tier: 'degraded',
      message: 'In-process cache. Not shared between processes and lost on restart.',
    }),
  }
}
