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
}

/** The whole tree, in tree order: a parent immediately before its children. */
export function listTerms(token: string, taxonomy: string): Promise<readonly Term[]> {
  return request(`/api/taxonomies/${encodeURIComponent(taxonomy)}`, {
    headers: authHeader(token),
  })
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

export function updateTerm(
  token: string,
  taxonomy: string,
  id: string,
  input: { readonly slug?: string; readonly labels?: Readonly<Record<string, string>> },
): Promise<Term> {
  return request(`/api/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
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
