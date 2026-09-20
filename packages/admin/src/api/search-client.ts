import { ApiError, authHeader, requestBody } from './http.js'

/**
 * `GET /api/search` — the full-text index (L10 task 3).
 *
 * The wire shape is `SearchHit` from `packages/schema/src/search/types.ts`,
 * copied by hand for the same reason every other client module copies its
 * shape: this is a browser bundle and that package is Node code.
 */

export interface SearchHit {
  readonly id: string
  readonly collection: string
  readonly locale: string
  readonly status: string
  readonly title: string
  /**
   * Relevance, higher is better — and comparable **within one result set
   * only**. A `ts_rank`, an InnoDB score and a BM25 are three different
   * numbers, so nothing here should ever display it or compare it across
   * queries.
   */
  readonly score: number
  /**
   * Prose around the first match, in the entry's real casing and accents —
   * `''` when the server had no gateway to build one, or the entry has since
   * become unreadable (fiche 36 task 3). Never HTML: render it through
   * `HighlightedExcerpt`, never `dangerouslySetInnerHTML` (R3/R8).
   */
  readonly excerpt: string
  /** Offsets, inside `excerpt`, of the substrings that matched a query term. */
  readonly highlights: readonly { readonly start: number; readonly end: number }[]
  /** `null` under the same conditions as `excerpt`. */
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

export interface SearchResults {
  readonly hits: readonly SearchHit[]
  readonly hasMore: boolean
  readonly nextOffset: number | null
}

export interface SearchOptions {
  /** Restricts the search to these collections. Absent means every readable one. */
  readonly collections?: readonly string[]
  /**
   * Anything other than `published` needs a role that may read drafts — the
   * server refuses otherwise rather than quietly returning less.
   */
  readonly status?: string
  readonly locale?: string
  readonly limit?: number
  readonly offset?: number
}

/**
 * The same search, asking for every state the server will allow.
 *
 * "All statuses" in this screen's own filter used to send no `status` at
 * all, and no `status` means `published` — the safe default for a caller
 * that says nothing. So the filter offered every state and delivered the one
 * an anonymous visitor sees, and an editor could not find their own draft
 * through it.
 *
 * Asked for, then fallen back from, rather than decided here: whether these
 * roles reach drafts is a per-collection decision the permission layer makes
 * (R4 — a client that re-derived it would be a second, drifting copy of the
 * rule). A refusal simply means this actor gets what they always got.
 */
export async function searchContentWidest(
  token: string,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResults> {
  if (options.status !== undefined) return searchContent(token, query, options)
  try {
    return await searchContent(token, query, { ...options, status: 'any' })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FORBIDDEN') {
      return searchContent(token, query, options)
    }
    throw error
  }
}

export async function searchContent(
  token: string,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResults> {
  const params = new URLSearchParams({ q: query })
  if (options.collections !== undefined && options.collections.length > 0) {
    params.set('collections', options.collections.join(','))
  }
  if (options.status !== undefined) params.set('status', options.status)
  if (options.locale !== undefined) params.set('locale', options.locale)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  if (options.offset !== undefined) params.set('offset', String(options.offset))

  const body = await requestBody<{
    readonly data: readonly SearchHit[]
    readonly page: { readonly hasMore: boolean; readonly nextOffset: number | null }
  }>(`/api/search?${params.toString()}`, { headers: authHeader(token) })

  return { hits: body.data, hasMore: body.page.hasMore, nextOffset: body.page.nextOffset }
}
