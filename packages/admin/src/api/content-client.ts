import { authHeader, request, requestBody } from './http.js'

/**
 * The thin fetch layer over `/api/content/*` — the wire shape a REST route
 * in `@cogenta/api` actually returns (`packages/api/src/content/serialise.ts`),
 * copied by hand for the same reason `schema/types.ts` copies the schema
 * document shape: this is a browser bundle, and that package is Node code.
 */

export interface Entry {
  readonly id: string
  readonly status: string
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly values: Readonly<Record<string, unknown>>
}

export interface EntryPage {
  readonly items: readonly Entry[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export type SortField = 'id' | 'createdAt' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

export interface ListOptions {
  readonly sort?: { readonly field: SortField; readonly direction: SortDirection }
  readonly status?: string
  readonly after?: string
  readonly limit?: number
}

function searchParamsFor(options: ListOptions): URLSearchParams {
  const params = new URLSearchParams()
  // Editors come to this list to find their own drafts as much as anything
  // published — `working` is the face that includes both, and the API
  // itself is the one thing that actually decides whether this actor may
  // see the unpublished half of it.
  params.set('state', 'working')
  if (options.sort !== undefined) {
    params.set('sort', `${options.sort.field}:${options.sort.direction}`)
  }
  if (options.status !== undefined) params.set('status', options.status)
  if (options.after !== undefined) params.set('after', options.after)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  return params
}

export async function listEntries(
  token: string,
  collection: string,
  options: ListOptions = {},
): Promise<EntryPage> {
  const query = searchParamsFor(options).toString()
  const body = await requestBody<{
    readonly data: readonly Entry[]
    readonly page: { readonly hasMore: boolean; readonly nextCursor: string | null }
  }>(`/api/content/${encodeURIComponent(collection)}${query === '' ? '' : `?${query}`}`, {
    headers: authHeader(token),
  })
  return { items: body.data, hasMore: body.page.hasMore, nextCursor: body.page.nextCursor }
}

export async function deleteEntry(token: string, collection: string, id: string): Promise<void> {
  await request(`/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** `state=working`, same reasoning as `listEntries`: editing means seeing the draft face, not just the published one. */
export function getEntry(token: string, collection: string, id: string): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?state=working`,
    { headers: authHeader(token) },
  )
}

export function createEntry(
  token: string,
  collection: string,
  values: Readonly<Record<string, unknown>>,
): Promise<Entry> {
  return request(`/api/content/${encodeURIComponent(collection)}`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ values }),
  })
}

export function updateEntry(
  token: string,
  collection: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
): Promise<Entry> {
  return request(`/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ values }),
  })
}
