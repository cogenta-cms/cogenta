import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import type {
  RateLimitConfig,
  RateLimitConsumeOptions,
  RateLimitDriver,
  RateLimitDriverOptions,
  RateLimitResult,
} from './types.js'

/**
 * Only what this driver calls, described structurally — the same reasoning as
 * `@cogenta/core`'s cache driver: importing `@redis/client`'s own types would
 * put an optional peer dependency in the published type declarations, and a
 * site with no Redis must not need it installed just to typecheck.
 */
interface RedisClientLike {
  connect(): Promise<unknown>
  quit(): Promise<unknown>
  ping(): Promise<string>
  incr(key: string): Promise<number>
  pExpire(key: string, milliseconds: number): Promise<unknown>
  del(keys: string[]): Promise<number>
}

interface RedisModuleLike {
  createClient(options: { url?: string }): RedisClientLike
}

/**
 * Loads the client if the host application installed it. Absent is a normal
 * outcome, not an error: it is what makes the registry fall through to the
 * memory driver, and what lets `pnpm install` stay dependency-free (R1).
 *
 * A second, independent loader from the cache driver's own `loadRedisModule`
 * rather than a shared one: the two needs are unrelated infrastructure
 * (`need: 'cache'` vs `need: 'rateLimit'`), and each keeps its own narrow
 * structural type for exactly the methods it calls, instead of coupling
 * through a shared "everything Redis" interface neither of them wants.
 */
export async function loadRateLimitRedisModule(): Promise<RedisModuleLike | null> {
  try {
    return (await import('@redis/client')) as unknown as RedisModuleLike
  } catch {
    return null
  }
}

export interface RedisRateLimitOptions extends RateLimitDriverOptions {
  readonly client: RedisClientLike
  /** Namespace for every key this driver writes. A Redis instance is often shared. */
  readonly prefix?: string
}

/**
 * A fixed-window counter kept in Redis, so every server process sharing that
 * Redis enforces the *same* quota for a key — the property the in-process
 * driver cannot offer.
 *
 * The window is the bucket's identity, not a value read back and compared:
 * `key:{windowIndex}` names a fresh counter every `windowMs`, `INCR` creates
 * and increments it atomically in one round trip, and `PEXPIRE` is set only
 * once — on the call that creates the bucket — so Redis reclaims it on its
 * own clock without this driver ever having to sweep for expired keys.
 */
export function createRedisRateLimiter(options: RedisRateLimitOptions): RateLimitDriver {
  const now = options.now ?? Date.now
  const prefix = options.prefix ?? 'cogenta:ratelimit:'
  const { client } = options

  return {
    consume: async (
      key,
      { limit, windowMs }: RateLimitConsumeOptions,
    ): Promise<RateLimitResult> => {
      const windowIndex = Math.floor(now() / windowMs)
      const bucketKey = `${prefix}${key}:${windowIndex}`
      const resetAt = (windowIndex + 1) * windowMs

      const count = await client.incr(bucketKey)
      if (count === 1) {
        // First hit in this window: set the bucket to expire with the window,
        // rather than lingering in memory forever once the site stops
        // calling it.
        await client.pExpire(bucketKey, windowMs)
      }

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt,
      }
    },

    reset: async (key, windowMs) => {
      const windowIndex = Math.floor(now() / windowMs)
      await client.del([`${prefix}${key}:${windowIndex}`])
    },
  }
}

export function redisRateLimitDriver(
  options: RateLimitDriverOptions & { prefix?: string } = {},
): Driver<RateLimitDriver, RateLimitConfig> {
  let client: RedisClientLike | undefined

  async function open(config: RateLimitConfig): Promise<RedisClientLike> {
    const module = await loadRateLimitRedisModule()
    if (module === null) {
      throw new CogentaError({
        code: 'DRIVER_INIT_FAILED',
        message: 'The Redis rate limit driver needs the "@redis/client" package.',
        hint: 'Run `pnpm add @redis/client`, or leave rateLimit.driver unset to use the in-process counter.',
      })
    }

    const created = module.createClient(config.url === undefined ? {} : { url: config.url })
    await created.connect()
    return created
  }

  return {
    name: 'redis',
    tier: 'optimal',

    // Does Redis actually answer? Not "is a URL configured?" — the difference
    // is what turns a graceful fallback into a startup crash.
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
      return createRedisRateLimiter({ ...options, client })
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
