import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/taxonomies/*` (`schema@2.0`, ADR-0022).
 *
 * The wire shape is hand-mirrored from `@cogenta/api`'s taxonomy router, for
 * the same reason every other `*-client.ts` here copies its server-side shape:
 * this is a browser bundle, and those are Node packages.
 *
 * Note what is **not** here: the materialised path. The API does not send it
 * on purpose — it is a storage decision, and a client that parsed it would be
 * coupled to it. `parent` and `depth` are what a tree needs.
 */

/** How many entries carry a term, direct and with descendants (task 3). */
export interface TermUsage {
  readonly own: number
  readonly withDescendants: number
}

export interface Term {
  readonly id: string
  readonly taxonomy: string
  readonly parent: string | null
  readonly slug: string
  readonly labels: Readonly<Record<string, string>>
  readonly position: number
  /** 0 at the root. Enough to indent a flat list into a tree. */
  readonly depth: number
  readonly createdAt: string
  readonly updatedAt: string
  /** Present only when `listTerms` was asked for `counts`. */
  readonly entryCount?: TermUsage
}

export interface ListTermsOptions {
  /** Label/slug search, accent- and case-insensitive — the server folds it. */
  readonly q?: string
  /** Adds `entryCount` to every term. */
  readonly counts?: boolean
  /** Keeps only terms with zero direct usage — the question before a clean-up. */
  readonly unused?: boolean
}

function searchParamsFor(options: ListTermsOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (options.q !== undefined && options.q !== '') params.set('q', options.q)
  if (options.counts === true) params.set('counts', '1')
  if (options.unused === true) params.set('unused', '1')
  return params
}

/** The whole tree, in tree order: a parent immediately before its children. */
export function listTerms(
  token: string,
  taxonomy: string,
  options: ListTermsOptions = {},
): Promise<readonly Term[]> {
  const query = searchParamsFor(options).toString()
  return request(
    `/api/taxonomies/${encodeURIComponent(taxonomy)}${query === '' ? '' : `?${query}`}`,
    { headers: authHeader(token) },
  )
}

export interface CreateTermInput {
  readonly slug: string
  readonly labels: Readonly<Record<string, string>>
  readonly parent?: string | null
}

export function createTerm(token: string, taxonomy: string, input: CreateTermInput): Promise<Term> {
  return request(`/api/taxonomies/${encodeURIComponent(taxonomy)}`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      slug: input.slug,
      labels: input.labels,
      ...(input.parent === undefined ? {} : { parent: input.parent }),
    }),
  })
}

export interface UpdateTermInput {
  readonly slug?: string
  readonly labels?: Readonly<Record<string, string>>
  readonly position?: number
}

/** Renames, relabels or reorders a term. Never changes its parent — see `moveTerm`. */
export function updateTerm(
  token: string,
  taxonomy: string,
  id: string,
  input: UpdateTermInput,
): Promise<Term> {
  return request(`/api/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

/**
 * Re-parents a term. A separate call from `updateTerm` because it is a
 * separate server operation — the store rewrites the whole subtree's
 * materialised path, refuses a cycle (`TAXONOMY_CYCLE`) and refuses landing
 * past the depth bound (`TAXONOMY_TOO_DEEP`).
 */
export function moveTerm(
  token: string,
  taxonomy: string,
  id: string,
  parent: string | null,
): Promise<Term> {
  return request(`/api/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ parent }),
  })
}

/**
 * Deletes a term. The server refuses while it still has children unless
 * `cascade` is asked for — deleting "Cuisine" must not silently take
 * "Desserts" with it.
 */
export async function deleteTerm(
  token: string,
  taxonomy: string,
  id: string,
  options: { readonly cascade?: boolean } = {},
): Promise<void> {
  const query = options.cascade === true ? '?cascade=true' : ''
  await request(
    `/api/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(id)}${query}`,
    { method: 'DELETE', headers: authHeader(token) },
  )
}
