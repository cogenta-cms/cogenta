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
 *
 * Keys come from callers that build them out of request data (an address, an
 * entry id), so the map is bounded twice: expired buckets are swept every
 * {@link SWEEP_EVERY} calls — a bucket only resets when its own key is reused,
 * so without the sweep every key ever seen stayed in memory — and the number
 * of live buckets never exceeds `maxKeys`. Past that ceiling the oldest window
 * is dropped first: buckets are re-inserted when their window starts, so the
 * map's insertion order is the order in which windows end.
 */
export const DEFAULT_MAX_RATE_LIMIT_KEYS = 100_000
const SWEEP_EVERY = 1_024

export function createMemoryRateLimiter(options: RateLimitDriverOptions = {}): RateLimitDriver {
  const now = options.now ?? Date.now
  const maxKeys = Math.max(1, options.maxKeys ?? DEFAULT_MAX_RATE_LIMIT_KEYS)
  const buckets = new Map<string, Bucket>()
  let callsSinceSweep = 0

  const sweep = (current: number): void => {
    callsSinceSweep = 0
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key)
    }
  }

  return {
    consume: async (key, { limit, windowMs }): Promise<RateLimitResult> => {
      const current = now()
      callsSinceSweep += 1
      if (callsSinceSweep >= SWEEP_EVERY) sweep(current)

      const existing = buckets.get(key)
      let bucket: Bucket
      if (existing !== undefined && existing.resetAt > current) {
        bucket = existing
      } else {
        // A new window: re-insert so insertion order stays the order in
        // which windows end, which is what the eviction below relies on.
        buckets.delete(key)
        if (buckets.size >= maxKeys) sweep(current)
        while (buckets.size >= maxKeys) {
          const oldest = buckets.keys().next()
          if (oldest.done === true) break
          buckets.delete(oldest.value)
        }
        bucket = { count: 0, resetAt: current + windowMs }
        buckets.set(key, bucket)
      }
      bucket.count += 1

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
