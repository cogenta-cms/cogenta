import type { DatabaseDialect, HealthReport } from '@cogenta/core'
import type { ContentStatus } from '../types.js'

/**
 * One indexable unit: an entry, in one locale, in one state.
 *
 * The index holds *extracted text*, never the stored JSON. A `richText`
 * document indexed raw would make `_type`, `span` and `markDefs` searchable
 * terms, and would rank a page by how many spans it happens to be split into.
 */
export interface SearchDocument {
  readonly id: string
  readonly collection: string
  readonly locale: string
  readonly status: ContentStatus
  /** Short label, returned with the hit so a caller can render a result list. */
  readonly title: string
  /** Everything else worth matching, already flattened to plain text. */
  readonly body: string
}

/** What identifies a document in the index. Entry ids are unique, but the
 * collection is part of the key so that clearing one collection is possible. */
export interface SearchReference {
  readonly id: string
  readonly collection: string
}

/**
 * A query.
 *
 * `locale` and `status` are **not optional filters**: they are the query.
 * Section 5 of the architecture makes permission filtering at query time
 * non-negotiable, and the way to honour that is to make it impossible to ask
 * for "everything" — there is no value of `SearchQuery` that reaches a draft
 * unless the caller names `draft`, and no value that crosses a locale.
 */
export interface SearchQuery {
  readonly text: string
  readonly locale: string
  /** Defaults to `published`: the safe answer when a caller says nothing. */
  readonly status?: ContentStatus
  /** Restricts to these collections. Absent means every indexed collection. */
  readonly collections?: readonly string[]
  readonly limit?: number
  readonly offset?: number
}

export interface SearchHit {
  readonly id: string
  readonly collection: string
  readonly locale: string
  readonly status: ContentStatus
  readonly title: string
  /**
   * Relevance, higher is better. Comparable **within one result set only**:
   * a `ts_rank`, an InnoDB fulltext score and a BM25 are three different
   * numbers, and the L1 spec accepts that rather than reimplementing an engine.
   */
  readonly score: number
}

export interface SearchResults {
  readonly hits: readonly SearchHit[]
  readonly hasMore: boolean
  /**
   * Offset of the next page, or null.
   *
   * Search is the one place the project pages by offset rather than by cursor.
   * A keyset cursor needs a total order over stable column values; a relevance
   * score is neither stable across an edit nor comparable between two runs of
   * the query, so a cursor built on it would silently skip and repeat rows.
   * The offset is capped instead, which is what a search UI needs anyway.
   */
  readonly nextOffset: number | null
}

/**
 * Full-text search, one interface over three engines that agree on very little.
 *
 * Postgres has `tsvector` and GIN, MySQL has `FULLTEXT` in boolean mode, SQLite
 * has FTS5 — and, when the runtime was built without it, nothing at all. The
 * L1 spec asks for exactly this: a common interface, and unequal result quality
 * accepted rather than a search engine written from scratch. What every
 * implementation *does* guarantee is the part that is not about ranking:
 *
 * - a document whose text contains every term of the query is found;
 * - accents and case never change whether it is found;
 * - a document in another locale, or in another state, is never returned.
 */
export interface SearchDriver {
  readonly dialect: DatabaseDialect
  /** Adds or replaces a document. Indexing the same reference twice is a
   * rewrite, so re-indexing after an edit needs no prior delete. */
  index(document: SearchDocument): Promise<void>
  remove(reference: SearchReference): Promise<void>
  search(query: SearchQuery): Promise<SearchResults>
  /** Empties the index, or only one collection's share of it. */
  clear(scope?: { readonly collection?: string }): Promise<void>
  health(): Promise<HealthReport>
}
