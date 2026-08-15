import { authHeader, requestBody } from './http.js'

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
