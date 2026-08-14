import type { Chunk } from '../chunking/types.js'

/**
 * A chunk (task 15) plus what it needs to be searched and to be filtered: the
 * site it belongs to and the vector task 14's `EmbeddingProvider` produced
 * for it. `{provider, model, dimensions}` is not repeated here — an index
 * mixing vectors from two different models is a caller error, not something
 * this module tries to detect; the lot's own answer to a model change is a
 * parallel index (a second `RagIndex` instance), not a mixed one.
 */
export interface IndexedChunk {
  readonly chunk: Chunk
  readonly siteId: string
  readonly vector: readonly number[]
}

export interface HybridSearchQuery {
  readonly text: string
  readonly vector: readonly number[]
}

export interface HybridSearchResult {
  readonly chunk: Chunk
  readonly siteId: string
  /** The fused RRF score — a rank signal, not a probability or a distance. */
  readonly score: number
}

export interface HybridSearchOptions {
  readonly limit?: number
  /**
   * Applied to every candidate **before** BM25/vector scoring even run — a
   * chunk this rejects is invisible to ranking, not merely dropped after the
   * fact. "Filtrage de permissions au moment de la requête — non
   * négociable": this module does not know what a draft, a private entry, or
   * a site boundary is — that stays the caller's real permission system's
   * job, structurally injected here exactly like `ContentServiceLike`
   * (task 5).
   */
  readonly canAccess: (chunk: IndexedChunk) => boolean
}

export interface RagIndex {
  upsert(indexed: IndexedChunk): void
  remove(chunkId: string): void
  search(query: HybridSearchQuery, options: HybridSearchOptions): readonly HybridSearchResult[]
}

/** One ranked list's entry — BM25's, the vector search's, or RRF's fused output. */
export interface RankedId {
  readonly id: string
  readonly score: number
}
