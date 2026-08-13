import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import { assertKey, decodeEntry, encodeEntry, expiryFrom, isExpired } from './entry.js'
import type { CacheConfig, CacheDriver, CacheDriverOptions, CacheSetOptions } from './types.js'

/**
 * Only what this driver calls, described structurally.
 *
 * Importing the client's own types would put `@redis/client` in the published
 * type declarations, and it is an *optional* peer: a site with no Redis must not
 * be asked to install it to typecheck.
 */
interface RedisClientLike {
  connect(): Promise<unknown>
  quit(): Promise<unknown>
  ping(): Promise<string>
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { PX?: number }): Promise<unknown>
  del(keys: string[]): Promise<number>
  sAdd(key: string, members: string[]): Promise<number>
  sRem(key: string, members: string[]): Promise<number>
  sMembers(key: string): Promise<string[]>
  scan(
    cursor: string,
    options: { MATCH: string; COUNT: number },
  ): Promise<{ cursor: string | number; keys: string[] }>
}

interface RedisModuleLike {
  createClient(options: { url?: string }): RedisClientLike
}

/**
 * Loads the client if the host application installed it. Absent is a normal
 * outcome, not an error: it is what makes the registry fall through to the file
 * driver, and what lets `pnpm install` stay dependency-free (rule R1).
 */
export async function loadRedisModule(): Promise<RedisModuleLike | null> {
  try {
    return (await import('@redis/client')) as unknown as RedisModuleLike
  } catch {
    return null
  }
}

export interface RedisCacheOptions extends CacheDriverOptions {
  readonly client: RedisClientLike
  /**
   * Namespace for every key this driver writes. A Redis instance is often
   * shared; `clear()` must never touch what it does not own.
   */
  readonly prefix?: string
}

export function createRedisCache(options: RedisCacheOptions): CacheDriver {
  const now = options.now ?? Date.now
  const prefix = options.prefix ?? 'cogenta:cache:'
  const { client } = options

  const entryKey = (key: string): string => `${prefix}e:${key}`
  const tagKey = (tag: string): string => `${prefix}t:${tag}`

  async function readEntry(key: string): Promise<ReturnType<typeof decodeEntry> | null> {
    const raw = await client.get(entryKey(key))
    if (raw === null) return null
    try {
      return decodeEntry(raw)
    } catch {
      return null
    }
  }

  async function untag(key: string): Promise<void> {
    const entry = await readEntry(key)
    for (const tag of entry?.tags ?? []) await client.sRem(tagKey(tag), [key])
  }

  return {
    get: async <T>(key: string): Promise<T | null> => {
      assertKey(key)
      const entry = await readEntry(key)
      if (entry === null) return null

      // Expiry is checked here as well as delegated to Redis. Redis expires on
      // wall-clock time it owns; checking the stored instant is what makes this
      // driver behave identically to the others, contract suite included.
      if (isExpired(entry.expiresAt, now())) {
        await client.del([entryKey(key)])
        return null
      }
      return entry.value as T
    },

    set: async <T>(key: string, value: T, setOptions?: CacheSetOptions): Promise<void> => {
      assertKey(key)
      const expiresAt = expiryFrom(setOptions?.ttl, now())
      const tags = [...new Set(setOptions?.tags ?? [])]
      const payload = encodeEntry(value, expiresAt, tags)

      await untag(key)

      // PX lets Redis reclaim the memory on its own clock. The authoritative
      // check stays in `get`.
      const ttlMs = setOptions?.ttl === undefined ? undefined : setOptions.ttl * 1000
      await client.set(entryKey(key), payload, ttlMs === undefined ? {} : { PX: ttlMs })

      for (const tag of tags) await client.sAdd(tagKey(tag), [key])
    },

    delete: async (key: string): Promise<void> => {
      assertKey(key)
      await untag(key)
      await client.del([entryKey(key)])
    },

    invalidateTags: async (tags: readonly string[]): Promise<void> => {
      for (const tag of tags) {
        const keys = await client.sMembers(tagKey(tag))
        if (keys.length > 0) await client.del(keys.map(entryKey))
        await client.del([tagKey(tag)])
      }
    },

    clear: async (): Promise<void> => {
      // SCAN, never FLUSHDB: this Redis may be serving other things, and a cache
      // driver that wipes someone else's data is an incident, not a clear.
      let cursor = '0'
      do {
        const result = await client.scan(cursor, { MATCH: `${prefix}*`, COUNT: 500 })
        cursor = String(result.cursor)
        if (result.keys.length > 0) await client.del(result.keys)
      } while (cursor !== '0')
    },
  }
}

export function redisCacheDriver(
  options: CacheDriverOptions & { prefix?: string } = {},
): Driver<CacheDriver, CacheConfig> {
  let client: RedisClientLike | undefined
  let url: string | undefined

  async function open(config: CacheConfig): Promise<RedisClientLike> {
    const module = await loadRedisModule()
    if (module === null) {
      throw new CogentaError({
        code: 'DRIVER_INIT_FAILED',
        message: 'The Redis cache driver needs the "@redis/client" package.',
        hint: 'Run `pnpm add @redis/client`, or leave cache.driver unset to use the file cache.',
      })
    }

    url = config.url
    const created = module.createClient(url === undefined ? {} : { url })
    await created.connect()
    return created
  }

  return {
    name: 'redis',
    tier: 'optimal',

    // Does Redis actually answer? Not "is a URL configured?" — the difference is
    // what turns a graceful fallback into a startup crash.
    available: async (config) => {
      if (config.url === undefined) return false
      try {
        const probe = await open(config)
        await probe.ping()
        await probe.quit()
        return true
      } catch {
        return false
      }
    },

    init: async (config) => {
      client ??= await open(config)
      return createRedisCache({ ...options, client })
    },

    dispose: async () => {
      try {
        await client?.quit()
      } catch {
        // Shutdown must not fail because the connection already dropped.
      }
      client = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (client === undefined) {
        return { status: 'down', driver: 'redis', tier: 'optimal', message: 'Not connected.' }
      }

      const startedAt = Date.now()
      try {
        await client.ping()
        return {
          status: 'ok',
          driver: 'redis',
          tier: 'optimal',
          latencyMs: Date.now() - startedAt,
          // The URL is not reported: it routinely carries a password.
          message: 'Connected.',
        }
      } catch (error) {
        return {
          status: 'down',
          driver: 'redis',
          tier: 'optimal',
          message: error instanceof Error ? error.message : 'Redis did not answer.',
        }
      }
    },
  }
}
