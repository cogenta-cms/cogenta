import { bm25Rank } from './bm25.js'
import { reciprocalRankFusion } from './rrf.js'
import type {
  HybridSearchOptions,
  HybridSearchQuery,
  HybridSearchResult,
  IndexedChunk,
  RagIndex,
} from './types.js'
import { vectorRank } from './vector-rank.js'

const DEFAULT_LIMIT = 10

/**
 * The always-available tier (R1) — every process has memory, nothing to
 * configure. `search` filters to `options.canAccess` first, then ranks only
 * what survived: BM25 and cosine similarity each produce a ranked list over
 * the *filtered* candidate set, fused by RRF. A chunk `canAccess` rejects
 * therefore cannot influence the result even indirectly (e.g. as noise in
 * BM25's document-frequency statistics) — it is as if it were never
 * indexed at all, for the duration of this one query.
 */
export function createMemoryRagIndex(): RagIndex {
  const chunks = new Map<string, IndexedChunk>()

  return {
    upsert(indexed: IndexedChunk) {
      chunks.set(indexed.chunk.id, indexed)
    },
    remove(chunkId: string) {
      chunks.delete(chunkId)
    },
    search(query: HybridSearchQuery, options: HybridSearchOptions): readonly HybridSearchResult[] {
      const allowed = [...chunks.values()].filter((indexed) => options.canAccess(indexed))
      const byId = new Map(allowed.map((indexed) => [indexed.chunk.id, indexed]))

      const fused = reciprocalRankFusion([
        bm25Rank(allowed, query.text),
        vectorRank(allowed, query.vector),
      ])

      const limit = options.limit ?? DEFAULT_LIMIT
      const results: HybridSearchResult[] = []
      for (const { id, score } of fused) {
        const indexed = byId.get(id)
        if (indexed === undefined) continue
        results.push({ chunk: indexed.chunk, siteId: indexed.siteId, score })
        if (results.length >= limit) break
      }
      return results
    },
  }
}
