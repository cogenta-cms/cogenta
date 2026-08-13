import { createDriverRegistry, type DriverRegistry } from '../drivers/index.js'
import type { Logger } from '../logger/index.js'
import { fileCacheDriver } from './file.js'
import { memoryCacheDriver } from './memory.js'
import { redisCacheDriver } from './redis.js'
import type { CacheConfig, CacheDriver, CacheDriverOptions } from './types.js'

export type { FileCacheOptions } from './file.js'
export { createFileCache, fileCacheDriver } from './file.js'
export { createMemoryCache, memoryCacheDriver } from './memory.js'
export type { RedisCacheOptions } from './redis.js'
export { createRedisCache, loadRedisModule, redisCacheDriver } from './redis.js'
export type { CacheConfig, CacheDriver, CacheDriverOptions, CacheSetOptions } from './types.js'

export interface CacheRegistryOptions extends CacheDriverOptions {
  readonly logger?: Logger
}

/**
 * The cache drivers Cogenta ships, in tier order.
 *
 * `file` before `memory`: both need no service, but a cache that survives a
 * restart and is shared between processes is worth more than one that does not.
 */
export function createCacheRegistry(
  options: CacheRegistryOptions = {},
): DriverRegistry<CacheDriver, CacheConfig> {
  const { logger, ...driverOptions } = options
  const registry = createDriverRegistry<CacheDriver, CacheConfig>({
    need: 'cache',
    ...(logger === undefined ? {} : { logger }),
  })

  registry.register(redisCacheDriver(driverOptions))
  registry.register(fileCacheDriver(driverOptions))
  registry.register(memoryCacheDriver(driverOptions))

  return registry
}
