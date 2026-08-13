import { createDriverRegistry, type DriverRegistry } from '../drivers/index.js'
import type { Logger } from '../logger/index.js'
import { localStorageDriver } from './local.js'
import { s3StorageDriver } from './s3.js'
import type { StorageConfig, StorageDriver, StorageDriverOptions } from './types.js'

export { assertKey, parseKey } from './key.js'
export type { LocalStorageOptions } from './local.js'
export {
  createLocalStorage,
  localStorageDriver,
  signLocalUrl,
  verifyLocalSignedUrl,
} from './local.js'
export type { S3Modules, S3StorageOptions } from './s3.js'
export { createS3Storage, loadS3Modules, s3StorageDriver } from './s3.js'
export type {
  StorageConfig,
  StorageDriver,
  StorageDriverOptions,
  StorageObjectInfo,
  StoragePutOptions,
} from './types.js'

export interface StorageRegistryOptions extends StorageDriverOptions {
  readonly logger?: Logger
}

export function createStorageRegistry(
  options: StorageRegistryOptions = {},
): DriverRegistry<StorageDriver, StorageConfig> {
  const { logger, ...driverOptions } = options
  const registry = createDriverRegistry<StorageDriver, StorageConfig>({
    need: 'storage',
    ...(logger === undefined ? {} : { logger }),
  })

  registry.register(s3StorageDriver(driverOptions))
  registry.register(localStorageDriver(driverOptions))

  return registry
}
