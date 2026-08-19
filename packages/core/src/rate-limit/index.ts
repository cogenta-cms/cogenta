import { createDriverRegistry, type DriverRegistry } from '../drivers/index.js'
import type { Logger } from '../logger/index.js'
import { memoryRateLimitDriver } from './memory.js'
import { redisRateLimitDriver } from './redis.js'
import type { RateLimitConfig, RateLimitDriver, RateLimitDriverOptions } from './types.js'

export { createMemoryRateLimiter, memoryRateLimitDriver } from './memory.js'
export type { RedisRateLimitOptions } from './redis.js'
export { createRedisRateLimiter, loadRateLimitRedisModule, redisRateLimitDriver } from './redis.js'
export type {
  RateLimitConfig,
  RateLimitConsumeOptions,
  RateLimitDriver,
  RateLimitDriverOptions,
  RateLimitResult,
} from './types.js'

export interface RateLimitRegistryOptions extends RateLimitDriverOptions {
  readonly logger?: Logger
}

/**
 * The request-quota drivers Cogenta ships, in tier order (fiche 20 task 3).
 *
 * `redis` before `memory`: both work with no configuration, but only Redis
 * keeps one true count across every process a site runs — the whole reason
 * a multi-process deployment would want it. R1 still holds: `memory` is
 * always available, so a site with no Redis loses nothing but that
 * cross-process precision.
 */
export function createRateLimitRegistry(
  options: RateLimitRegistryOptions = {},
): DriverRegistry<RateLimitDriver, RateLimitConfig> {
  const { logger, ...driverOptions } = options
  const registry = createDriverRegistry<RateLimitDriver, RateLimitConfig>({
    need: 'rateLimit',
    ...(logger === undefined ? {} : { logger }),
  })

  registry.register(redisRateLimitDriver(driverOptions))
  registry.register(memoryRateLimitDriver(driverOptions))

  return registry
}
