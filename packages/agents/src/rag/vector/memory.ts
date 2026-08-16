import { CogentaError, type Driver, type HealthReport } from '@cogenta/core'
import { vectorRank } from '../index/vector-rank.js'
import {
  matchesFilter,
  VECTOR_DEFAULTS,
  type VectorConfig,
  type VectorFilter,
  type VectorMatch,
  type VectorRecord,
  type VectorSearchOptions,
  type VectorStore,
} from './types.js'

/**
 * The always-available tier (R1): every process has memory, nothing to install,
 * nothing to configure. Exact cosine over every record in scope — which is what
 * `docs/02-architecture.md` names as the degraded row for this need, and it is
 * exact rather than approximate, so it is the *reference* answer the persistent
 * drivers are checked against by the shared contract suite.
 *
 * Scoring is `vectorRank` from L4, unchanged and un-duplicated.
 */
export function createMemoryVectorStore(options: { readonly dimensions: number }): VectorStore {
  const { dimensions } = options
  const records = new Map<string, VectorRecord>()

  function assertDimensions(record: VectorRecord): void {
    if (record.vector.length === dimensions) return
    throw new CogentaError({
      code: 'VECTOR_DIMENSION_MISMATCH',
      message: `This store holds ${dimensions}-dimension vectors and was handed one of ${record.vector.length}.`,
      hint: 'Changing embedding model means a new, parallel index — never mixing two models in one store. Re-index from scratch after a model change.',
      details: { expected: dimensions, received: record.vector.length, chunkId: record.chunk.id },
    })
  }

  return {
    dimensions,

    async upsert(incoming) {
      // Validated up front, all of them, before a single write lands: a batch
      // that fails half-way through would leave the index in a state no caller
      // can reason about.
      for (const record of incoming) assertDimensions(record)
      for (const record of incoming) records.set(record.chunk.id, record)
    },

    async remove(chunkIds) {
      for (const id of chunkIds) records.delete(id)
    },

    async removeEntries(scope) {
      const entries = new Set(scope.entryIds)
      for (const [id, record] of records) {
        if (
          record.siteId === scope.siteId &&
          record.collection === scope.collection &&
          entries.has(record.entryId)
        ) {
          records.delete(id)
        }
      }
    },

    async search(queryVector, searchOptions?: VectorSearchOptions) {
      const scoped = [...records.values()].filter((record) =>
        matchesFilter(record, searchOptions?.filter),
      )
      const byId = new Map(scoped.map((record) => [record.chunk.id, record]))

      const ranked = vectorRank(
        scoped.map((record) => ({
          chunk: record.chunk,
          siteId: record.siteId,
          vector: record.vector,
        })),
        queryVector,
      )

      const limit = searchOptions?.limit ?? VECTOR_DEFAULTS.limit
      const minScore = searchOptions?.minScore
      const matches: VectorMatch[] = []
      for (const { id, score } of ranked) {
        if (minScore !== undefined && score < minScore) break
        const record = byId.get(id)
        if (record === undefined) continue
        matches.push({ record, score })
        if (matches.length >= limit) break
      }
      return matches
    },

    async count(filter?: VectorFilter) {
      return [...records.values()].filter((record) => matchesFilter(record, filter)).length
    },

    async clear() {
      records.clear()
    },
  }
}

export function memoryVectorDriver(): Driver<VectorStore, VectorConfig> {
  let store: VectorStore | null = null

  return {
    name: 'memory',
    tier: 'degraded',
    // Memory is the one thing that is always there. Saying so plainly is what
    // makes it a usable last resort rather than one more thing that can refuse.
    available: async () => true,
    init: async (config) => {
      store = createMemoryVectorStore({ dimensions: config.dimensions })
      return store
    },
    dispose: async () => {
      await store?.clear()
      store = null
    },
    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'memory',
      tier: 'degraded',
      message:
        'Embeddings are kept in memory and are lost on restart; the site re-indexes on the next ingest.',
      ...(store === null ? {} : { details: { records: await store.count() } }),
    }),
  }
}
