import type { EmbeddingProvider } from '../embeddings/types.js'
import { reciprocalRankFusion } from '../index/rrf.js'
import type { RankedId } from '../index/types.js'
import type { VectorMatch, VectorStore } from '../vector/types.js'

/**
 * The slice of `@cogenta/schema`'s `SearchDriver` this module calls, declared
 * structurally rather than imported — the same reasoning `ContentServiceLike`
 * documents: the dependency arrow from `@cogenta/agents` to the content engine
 * points one way only, and it is not this way.
 *
 * A real `SearchDriver` satisfies it as-is.
 */
export interface FullTextSearchLike {
  search(query: {
    readonly text: string
    readonly locale: string
    readonly status?: string
    readonly collections?: readonly string[]
    readonly limit?: number
  }): Promise<{
    readonly hits: readonly {
      readonly id: string
      readonly collection: string
      readonly locale: string
      readonly status: string
      readonly title: string
      readonly score: number
    }[]
  }>
}

export interface SemanticHit {
  readonly id: string
  readonly collection: string
  readonly locale: string
  readonly status: string
  readonly title: string
  /** The chunk that matched, when the hit came from the vector side. Absent for a full-text-only hit. */
  readonly excerpt?: string
  /** Fused RRF score — a rank signal, never a distance or a probability. */
  readonly score: number
  /** Which halves of the hybrid produced this hit. Shown in the admin, and the thing that makes "why is this here?" answerable. */
  readonly matched: readonly ('semantic' | 'full-text')[]
}

export interface SemanticSearchQuery {
  readonly text: string
  readonly locale: string
  readonly siteId: string
  readonly status?: string
  /** Already narrowed to what the actor may read — this module never decides that. */
  readonly collections: readonly string[]
  readonly limit?: number
}

export interface SemanticSearch {
  /** True when a vector store and an embedding provider are both wired in. */
  readonly available: boolean
  search(query: SemanticSearchQuery): Promise<readonly SemanticHit[]>
}

export interface SemanticSearchOptions {
  readonly store: VectorStore
  readonly embeddings: EmbeddingProvider
  /**
   * L10's full-text index. Optional, and its absence is not an error: the
   * hybrid degrades to the vector half alone rather than refusing. The reverse
   * — no vector half — is handled by not building this object at all.
   */
  readonly fullText?: FullTextSearchLike
  /** How many candidates each half contributes before fusion. */
  readonly candidates?: number
}

const DEFAULT_LIMIT = 10
const DEFAULT_CANDIDATES = 30

function keyOf(collection: string, id: string): string {
  return `${collection}:${id}`
}

/**
 * Semantic search, fused with the full-text search L10 wired up — **beside it,
 * never instead of it**, which is what L18's dependency line asks for in as many
 * words.
 *
 * Fusion is RRF over the two ranked lists, reusing L4's `reciprocalRankFusion`
 * unchanged. Fusing ranks rather than scores is not a stylistic choice: a
 * `ts_rank`, an InnoDB fulltext score and a cosine similarity live on three
 * incomparable scales, and averaging them produces a number that means nothing.
 *
 * The known failure of pure vector search — exact-keyword queries, a part
 * number, a person's name — is exactly what the full-text half covers, and the
 * architecture document says so at line 190. Neither half is allowed to be the
 * only one.
 */
export function createSemanticSearch(options: SemanticSearchOptions): SemanticSearch {
  const candidates = options.candidates ?? DEFAULT_CANDIDATES

  async function vectorHalf(
    query: SemanticSearchQuery,
  ): Promise<{ ranked: readonly RankedId[]; byKey: Map<string, VectorMatch> }> {
    const [vector] = await options.embeddings.embed([query.text])
    const byKey = new Map<string, VectorMatch>()
    if (vector === undefined) return { ranked: [], byKey }

    const matches = await options.store.search(vector, {
      limit: candidates,
      filter: {
        siteId: query.siteId,
        collections: query.collections,
        locales: [query.locale],
        ...(query.status === undefined ? {} : { statuses: [query.status] }),
      },
    })

    const ranked: RankedId[] = []
    for (const match of matches) {
      const key = keyOf(match.record.collection, match.record.entryId)
      // Several chunks of one entry can match. The entry appears once, at its
      // best chunk's rank — otherwise a long article crowds out every other
      // result purely by having more chunks.
      if (byKey.has(key)) continue
      byKey.set(key, match)
      ranked.push({ id: key, score: match.score })
    }
    return { ranked, byKey }
  }

  async function textHalf(query: SemanticSearchQuery): Promise<{
    ranked: readonly RankedId[]
    byKey: Map<string, { readonly title: string; readonly status: string }>
  }> {
    const byKey = new Map<string, { readonly title: string; readonly status: string }>()
    if (options.fullText === undefined) return { ranked: [], byKey }

    const results = await options.fullText.search({
      text: query.text,
      locale: query.locale,
      collections: query.collections,
      limit: candidates,
      ...(query.status === undefined ? {} : { status: query.status }),
    })

    const ranked: RankedId[] = []
    for (const hit of results.hits) {
      const key = keyOf(hit.collection, hit.id)
      if (byKey.has(key)) continue
      byKey.set(key, { title: hit.title, status: hit.status })
      ranked.push({ id: key, score: hit.score })
    }
    return { ranked, byKey }
  }

  return {
    available: true,

    async search(query) {
      if (query.collections.length === 0) return []

      // Both halves run against the *already narrowed* collection list, so a
      // collection the actor may not read is invisible to ranking rather than
      // filtered out afterwards — the same ordering `createMemoryRagIndex`
      // enforces, and for the same reason.
      const [vector, text] = await Promise.all([vectorHalf(query), textHalf(query)])
      const fused = reciprocalRankFusion([vector.ranked, text.ranked])

      const limit = query.limit ?? DEFAULT_LIMIT
      const hits: SemanticHit[] = []
      for (const { id: key, score } of fused) {
        const match = vector.byKey.get(key)
        const textHit = text.byKey.get(key)
        const matched: ('semantic' | 'full-text')[] = []
        if (match !== undefined) matched.push('semantic')
        if (textHit !== undefined) matched.push('full-text')

        const collection = key.slice(0, key.indexOf(':'))
        const entryId = key.slice(key.indexOf(':') + 1)
        const title = textHit?.title ?? match?.record.chunk.text.slice(0, 80) ?? entryId

        hits.push({
          id: entryId,
          collection,
          locale: query.locale,
          status: textHit?.status ?? match?.record.status ?? 'published',
          title,
          ...(match === undefined ? {} : { excerpt: match.record.chunk.text }),
          score,
          matched,
        })
        if (hits.length >= limit) break
      }
      return hits
    },
  }
}
