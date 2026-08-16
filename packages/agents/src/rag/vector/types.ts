/**
 * The `vector` driver need — L18 task 1 and task 5.
 *
 * **Task 1 was to check what already exists before writing anything, and the
 * answer changed the shape of this file.** What was found:
 *
 * - `docs/02-architecture.md` names `vector` in the driver row ("pgvector,
 *   MariaDB VECTOR | Cosinus exact en mémoire") and in the driver list of the
 *   layer diagram — planned, never implemented.
 * - `packages/core/src/drivers/` has the generic registry (`Driver`,
 *   `createDriverRegistry`) that cache/queue/storage/database are all built on,
 *   but **no** `vector` need registered anywhere.
 * - `@cogenta/agents` already ships, from L4, the *retrieval* half: an
 *   `EmbeddingProvider` interface with a real local implementation
 *   (`createHashingEmbeddingProvider`), and a whole hybrid index —
 *   `createMemoryRagIndex`, `bm25Rank`, `vectorRank`, `reciprocalRankFusion`,
 *   with query-time permission filtering.
 * - `packages/core/src/config/schema.ts` already has an `embeddings` section
 *   (`provider`/`model`/`dimensions`).
 *
 * So the missing piece was never "a way to rank vectors" — that exists and is
 * tested. It was **a place to keep them that outlives the process**, and a
 * driver registry to pick between such places. That is exactly what this
 * interface is, and nothing here re-implements cosine similarity: the memory
 * driver calls the existing `vectorRank`.
 *
 * The interface is async where `RagIndex` is sync, because a store that reaches
 * a database cannot be anything else. `RagIndex` is deliberately left alone: it
 * is the in-request ranking primitive, this is the persistence one.
 */

import type { Chunk } from '../chunking/types.js'

/**
 * The scope every record carries, and the only thing a store may filter on.
 *
 * Deliberately not "any metadata": a store that accepts arbitrary filter
 * predicates has to implement them per backend, and the ones that matter for a
 * CMS are exactly these. Anything finer is the caller's `canAccess` predicate,
 * applied above the store, where the real permission layer lives.
 */
export interface VectorScope {
  readonly siteId: string
  readonly collection: string
  readonly entryId: string
  readonly locale: string
  /** `draft` / `published` / … — mirrors `ContentStatus` without importing `@cogenta/schema`. */
  readonly status: string
}

export interface VectorRecord extends VectorScope {
  readonly chunk: Chunk
  readonly vector: readonly number[]
}

export interface VectorFilter {
  readonly siteId?: string
  readonly collections?: readonly string[]
  readonly locales?: readonly string[]
  readonly statuses?: readonly string[]
  /** Excludes one entry from its own results — what duplicate detection needs. */
  readonly excludeEntryIds?: readonly string[]
}

export interface VectorMatch {
  readonly record: VectorRecord
  /** Cosine similarity in `[-1, 1]`, comparable across backends because every backend computes cosine. */
  readonly score: number
}

export interface VectorSearchOptions {
  readonly limit?: number
  readonly filter?: VectorFilter
  /**
   * Discards matches below this cosine similarity. Absent means "keep
   * everything the limit allows" — a threshold is a product decision (how close
   * is "a duplicate"?), never a default this layer invents.
   */
  readonly minScore?: number
}

/**
 * Where embeddings live between requests.
 *
 * `dimensions` is on the store, not on each call, and `upsert` refuses a vector
 * of any other length: an index holding two models' vectors ranks nonsense with
 * no error anywhere, which is the single worst failure mode of this subsystem.
 * The L4 rule stands unchanged — changing model means a parallel index, not a
 * mixed one.
 */
export interface VectorStore {
  readonly dimensions: number
  upsert(records: readonly VectorRecord[]): Promise<void>
  /** By chunk id. Unknown ids are ignored, not an error — a re-ingest must be idempotent. */
  remove(chunkIds: readonly string[]): Promise<void>
  /** Everything belonging to these entries, whatever their chunk ids are. */
  removeEntries(scope: {
    readonly siteId: string
    readonly collection: string
    readonly entryIds: readonly string[]
  }): Promise<void>
  search(
    queryVector: readonly number[],
    options?: VectorSearchOptions,
  ): Promise<readonly VectorMatch[]>
  count(filter?: VectorFilter): Promise<number>
  clear(): Promise<void>
}

/** The resolved `vector` section of the configuration — same shape family as `CacheConfig`. */
export interface VectorConfig {
  readonly driver?: string
  readonly dimensions: number
  /** Where the `file` driver keeps its records. */
  readonly path?: string
  /** Table name for the `pgvector` driver. */
  readonly table?: string
}

const DEFAULT_LIMIT = 10

export const VECTOR_DEFAULTS = Object.freeze({ limit: DEFAULT_LIMIT })

/** Shared by every driver so "which records are in scope" cannot drift between them. */
export function matchesFilter(record: VectorRecord, filter?: VectorFilter): boolean {
  if (filter === undefined) return true
  if (filter.siteId !== undefined && record.siteId !== filter.siteId) return false
  if (filter.collections !== undefined && !filter.collections.includes(record.collection)) {
    return false
  }
  if (filter.locales !== undefined && !filter.locales.includes(record.locale)) return false
  if (filter.statuses !== undefined && !filter.statuses.includes(record.status)) return false
  if (filter.excludeEntryIds !== undefined && filter.excludeEntryIds.includes(record.entryId)) {
    return false
  }
  return true
}
