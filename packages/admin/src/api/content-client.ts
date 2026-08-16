import { authHeader, request, requestBody } from './http.js'

/**
 * The thin fetch layer over `/api/content/*` — the wire shape a REST route
 * in `@cogenta/api` actually returns (`packages/api/src/content/serialise.ts`),
 * copied by hand for the same reason `schema/types.ts` copies the schema
 * document shape: this is a browser bundle, and that package is Node code.
 */

/** One block of a block zone — contract B's `key`/`type`/`data`, the wire shape `/api/content/*` actually sends and accepts (not `@cogenta/blocks`'s internal `_key`/`_type`/`_version` envelope). */
export interface ContentBlock {
  readonly key: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

/** Block zones of an entry, keyed by the name of the `blocks` field. */
export type BlockZones = Readonly<Record<string, readonly ContentBlock[]>>

export interface Entry {
  readonly id: string
  readonly status: string
  /**
   * When this entry went to the trash, `null` while it has not (`schema@2.0`,
   * ADR-0022). Orthogonal to `status`: an entry in the trash still reports the
   * status it had, which is what the trash screen shows and what restoring
   * gives back.
   */
  readonly deletedAt: string | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly locale: string
  /** The source entry's id, when this one is a translation of it (ADR-0014). */
  readonly translationOf: string | null
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: BlockZones
}

export interface EntryPage {
  readonly items: readonly Entry[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export type SortField = 'id' | 'createdAt' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

/** Whether a list reaches into the trash. Absent means no (`schema@2.0`). */
export type TrashFilter = 'exclude' | 'include' | 'only'

export interface ListOptions {
  readonly sort?: { readonly field: SortField; readonly direction: SortDirection }
  readonly status?: string
  readonly after?: string
  readonly limit?: number
  readonly trashed?: TrashFilter
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
  if (options.trashed !== undefined) params.set('trashed', options.trashed)
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

/** Moves the entry to the trash — or deletes it outright when the collection declares `trash: false`. */
export async function deleteEntry(token: string, collection: string, id: string): Promise<void> {
  await request(`/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** Takes an entry back out of the trash, with the status it went in with. */
export function untrashEntry(token: string, collection: string, id: string): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/untrash`,
    { method: 'POST', headers: authHeader(token) },
  )
}

/**
 * The real delete: nothing is kept, and nothing comes back.
 *
 * Its own route rather than a second meaning for `DELETE` — the API made that
 * choice deliberately (ADR-0022), and the client mirrors it so that a slip of
 * the finger here cannot destroy anything either.
 */
export async function purgeEntry(token: string, collection: string, id: string): Promise<void> {
  await request(`/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/purge`, {
    method: 'POST',
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

export interface CreateEntryOptions {
  readonly blocks?: BlockZones
  readonly locale?: string
  /** The source entry's id — this create becomes its translation (ADR-0014). */
  readonly translationOf?: string
}

export function createEntry(
  token: string,
  collection: string,
  values: Readonly<Record<string, unknown>>,
  options: CreateEntryOptions = {},
): Promise<Entry> {
  const { blocks, locale, translationOf } = options
  return request(`/api/content/${encodeURIComponent(collection)}`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      values,
      ...(blocks === undefined ? {} : { blocks }),
      ...(locale === undefined ? {} : { locale }),
      ...(translationOf === undefined ? {} : { translationOf }),
    }),
  })
}

export function updateEntry(
  token: string,
  collection: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
  blocks?: BlockZones,
): Promise<Entry> {
  return request(`/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(blocks === undefined ? { values } : { values, blocks }),
  })
}

/** One entry of `GET /{collection}/{id}/history` — `packages/schema/src/store/types.ts`'s `VersionSummary`. */
export interface VersionSummary {
  readonly version: number
  readonly status: string
  readonly createdAt: string
  readonly createdBy: string | null
  /** True for the version the live row currently holds. */
  readonly live: boolean
}

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface FieldChange {
  readonly field: string
  readonly change: ChangeKind
  readonly before: unknown
  readonly after: unknown
}

export interface BlockChange {
  readonly zone: string
  readonly key: string
  readonly type: string
  readonly change: ChangeKind | 'moved'
  readonly fromIndex: number | null
  readonly toIndex: number | null
  /** Populated for `changed`: what changed inside the block. */
  readonly fields: readonly FieldChange[]
}

/** `GET /{collection}/{id}/diff`'s response — a field-by-field and block-by-block diff, never a diff of a serialisation (`packages/schema/src/store/diff.ts`). */
export interface ContentDiff {
  readonly fields: readonly FieldChange[]
  readonly blocks: readonly BlockChange[]
  readonly changed: boolean
}

export function getHistory(
  token: string,
  collection: string,
  id: string,
): Promise<readonly VersionSummary[]> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/history`,
    { headers: authHeader(token) },
  )
}

/** Every live entry of the translation family this one belongs to (ADR-0014), itself included — one per locale. */
export function getTranslations(
  token: string,
  collection: string,
  id: string,
): Promise<readonly Entry[]> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/translations`,
    { headers: authHeader(token) },
  )
}

export function getDiff(
  token: string,
  collection: string,
  id: string,
  from: number,
  to: number,
): Promise<ContentDiff> {
  const params = new URLSearchParams({ from: String(from), to: String(to) })
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/diff?${params.toString()}`,
    { headers: authHeader(token) },
  )
}

/** Restore writes a new working version copied from `version` — it never republishes on its own, and never rewinds the version counter (rule R6: reversible, and the restore itself stays undoable). */
export function restoreVersion(
  token: string,
  collection: string,
  id: string,
  version: number,
): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/restore`,
    { method: 'POST', headers: authHeader(token), body: JSON.stringify({ version }) },
  )
}

/** `POST /{collection}/{id}/preview`'s response — a token, the path it resolves to (null when the collection has no route), and the ready-made absolute URL (null when the server has no `site.url` configured). */
export interface PreviewLink {
  readonly token: string
  readonly expiresIn: number
  readonly path: string | null
  readonly url: string | null
}

/**
 * Mints a one-entry, time-limited link to the real rendered page — never a
 * simulation inside the admin (L2-admin.md: "une prévisualisation qui ment
 * est pire que pas de prévisualisation").
 */
export function issuePreview(token: string, collection: string, id: string): Promise<PreviewLink> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/preview`,
    { method: 'POST', headers: authHeader(token) },
  )
}
