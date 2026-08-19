import type { Driver, HealthReport } from '../drivers/index.js'
import type {
  RateLimitConfig,
  RateLimitDriver,
  RateLimitDriverOptions,
  RateLimitResult,
} from './types.js'

interface Bucket {
  count: number
  readonly resetAt: number
}

/**
 * In-process fixed-window counter. Needs nothing at all, so it is what a
 * single-process site falls back to when there is no Redis — exactly the
 * degraded half of R1, and the one that must work by default, since
 * `npm create cogenta` produces a site with nothing else installed.
 *
 * Its counters die with the process, which only matters for a multi-process
 * deployment: each process enforces its own quota independently, so the
 * effective ceiling is `limit * processCount` rather than `limit`. That is
 * the documented trade a site accepts by not running Redis, the same one
 * `memoryCacheDriver` makes for caching.
 */
export function createMemoryRateLimiter(options: RateLimitDriverOptions = {}): RateLimitDriver {
  const now = options.now ?? Date.now
  const buckets = new Map<string, Bucket>()

  return {
    consume: async (key, { limit, windowMs }): Promise<RateLimitResult> => {
      const current = now()
      const existing = buckets.get(key)

      const bucket =
        existing !== undefined && existing.resetAt > current
          ? existing
          : { count: 0, resetAt: current + windowMs }
      bucket.count += 1
      buckets.set(key, bucket)

      return {
        allowed: bucket.count <= limit,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      }
    },

    // `windowMs` is unused here: this driver stores one bucket per raw key,
    // carrying its own `resetAt`, so it never needs the window length to
    // find it — unlike Redis, which names the bucket by window.
    reset: async (key, _windowMs) => {
      buckets.delete(key)
    },
  }
}

export function memoryRateLimitDriver(
  options: RateLimitDriverOptions = {},
): Driver<RateLimitDriver, RateLimitConfig> {
  let instance: RateLimitDriver | undefined

  return {
    name: 'memory',
    tier: 'degraded',
    available: async () => true,
    init: async () => {
      instance ??= createMemoryRateLimiter(options)
      return instance
    },
    dispose: async () => {
      instance = undefined
    },
    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'memory',
      tier: 'degraded',
      message:
        'In-process request counter. Each server process enforces its own quota independently.',
    }),
  }
}
