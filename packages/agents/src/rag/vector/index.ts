import {
  createDriverRegistry,
  type DatabaseHandle,
  type DriverRegistry,
  type Logger,
} from '@cogenta/core'
import { fileVectorDriver } from './file.js'
import { memoryVectorDriver } from './memory.js'
import { pgVectorDriver } from './pgvector.js'
import type { VectorConfig, VectorStore } from './types.js'

export type { FileVectorOptions } from './file.js'
export { createFileVectorStore, fileVectorDriver } from './file.js'
export { createMemoryVectorStore, memoryVectorDriver } from './memory.js'
export type { PgVectorDriverOptions, PgVectorOptions } from './pgvector.js'
export { createPgVectorStore, pgVectorDriver, vectorLiteral } from './pgvector.js'
export type {
  VectorConfig,
  VectorFilter,
  VectorMatch,
  VectorRecord,
  VectorScope,
  VectorSearchOptions,
  VectorStore,
} from './types.js'
export { matchesFilter, VECTOR_DEFAULTS } from './types.js'

export interface VectorRegistryOptions {
  /** The site database, lent to `pgvector`. Absent means only the two service-free drivers can run. */
  readonly db?: DatabaseHandle
  readonly logger?: Logger
}

/**
 * The vector drivers Cogenta ships, in tier order.
 *
 * `file` before `memory` among the degraded pair, for the same reason the cache
 * registry orders them that way: both need no service, and the one that survives
 * a restart is worth more than the one that does not. A site with no Postgres
 * still gets working semantic search — that is R1, not a nicety.
 */
export function createVectorRegistry(
  options: VectorRegistryOptions = {},
): DriverRegistry<VectorStore, VectorConfig> {
  const registry = createDriverRegistry<VectorStore, VectorConfig>({
    need: 'vector',
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })

  registry.register(pgVectorDriver(options.db === undefined ? {} : { db: options.db }))
  registry.register(fileVectorDriver())
  registry.register(memoryVectorDriver())

  return registry
}
