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
  /** The account id that created/last updated this entry, or `null` — an entry seeded before accounts existed, say. Resolved to an email via `/api/users/{id}` (fiche 02 task 4). */
  readonly createdBy: string | null
  readonly updatedBy: string | null
  readonly locale: string
  /** The source entry's id, when this one is a translation of it (ADR-0014). */
  readonly translationOf: string | null
  /**
   * When this entry went — or is due to go — public. `null` while it never
   * has and none is scheduled. Set for a `status: 'scheduled'` entry to the
   * future instant it becomes public.
   */
  readonly publishedAt: string | null
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: BlockZones
}

export interface EntryPage {
  readonly items: readonly Entry[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
  /**
   * How many live entries this collection holds, by status — present only
   * when `counts: true` was asked for (fiche 01 "Liste de contenu", task 4).
   * A status a role may not read (a viewer's drafts, say) is simply absent
   * from this record rather than reported as `0`: the server never sends a
   * number it would be a leak to answer.
   */
  readonly counts?: Readonly<Partial<Record<string, number>>>
}

export type SortField = 'id' | 'createdAt' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

/** Whether a list reaches into the trash. Absent means no (`schema@2.0`). */
export type TrashFilter = 'exclude' | 'include' | 'only'

/**
 * A taxonomy field's value as a list filter (fiche 01 task 5).
 *
 * `many` picks the operator: `contains` for a to-many taxonomy field (its
 * value is an array of term ids, and `eq` would compare the whole array
 * against one id and never match), `eq` for a single-valued one.
 */
export interface TermFilter {
  readonly field: string
  readonly termId: string
  readonly many: boolean
}

export interface ListOptions {
  readonly sort?: { readonly field: SortField; readonly direction: SortDirection }
  readonly status?: string
  readonly after?: string
  readonly limit?: number
  readonly trashed?: TrashFilter
  /** Restricts the list to one locale of the translation family (fiche 01 task 5). */
  readonly locale?: string
  /** `updatedAt >=` this ISO instant (fiche 01 task 5). */
  readonly updatedFrom?: string
  /** `updatedAt <=` this ISO instant (fiche 01 task 5). */
  readonly updatedTo?: string
  readonly termFilter?: TermFilter
  /** Adds `counts` (by status) to the response, alongside the page (fiche 01 task 4). */
  readonly counts?: boolean
}

/**
 * `depth=0` on every request in this module that can carry it.
 *
 * REST expands a relation to the related entry's whole document by default
 * (`packages/api/src/content/serialise.ts`'s `ExpansionOptions.depth`,
 * defaulted to 1) — a reasonable default for a headless consumer rendering a
 * page, and the wrong one for this admin: this module's `Entry.values` is
 * read back into a form's local state and resubmitted verbatim on the next
 * save (`EntryEditRoute`'s `values`/`setValues`), so an expanded relation
 * silently turns "the id `person-1`" into a whole nested object the next
 * save would try to write back as a relation's value — which the store
 * refuses (a relation column holds a string, never an object). This admin
 * always resolves a related entry's title itself (`EntryPicker`,
 * `getEntriesByIds`), so it never needed the expansion in the first place.
 */
const NO_EXPANSION = 'depth=0'

function searchParamsFor(options: ListOptions): URLSearchParams {
  const params = new URLSearchParams()
  // Editors come to this list to find their own drafts as much as anything
  // published — `working` is the face that includes both, and the API
  // itself is the one thing that actually decides whether this actor may
  // see the unpublished half of it.
  params.set('state', 'working')
  params.set('depth', '0')
  if (options.sort !== undefined) {
    params.set('sort', `${options.sort.field}:${options.sort.direction}`)
  }
  if (options.status !== undefined) params.set('status', options.status)
  if (options.after !== undefined) params.set('after', options.after)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  if (options.trashed !== undefined) params.set('trashed', options.trashed)
  if (options.locale !== undefined) params.set('locale', options.locale)
  if (options.updatedFrom !== undefined) params.set('filter.updatedAt.gte', options.updatedFrom)
  if (options.updatedTo !== undefined) params.set('filter.updatedAt.lte', options.updatedTo)
  if (options.termFilter !== undefined) {
    const operator = options.termFilter.many ? 'contains' : 'eq'
    params.set(`filter.${options.termFilter.field}.${operator}`, options.termFilter.termId)
  }
  if (options.counts === true) params.set('counts', '1')
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
    readonly counts?: Readonly<Partial<Record<string, number>>>
  }>(`/api/content/${encodeURIComponent(collection)}${query === '' ? '' : `?${query}`}`, {
    headers: authHeader(token),
  })
  return {
    items: body.data,
    hasMore: body.page.hasMore,
    nextCursor: body.page.nextCursor,
    ...(body.counts === undefined ? {} : { counts: body.counts }),
  }
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
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/untrash?${NO_EXPANSION}`,
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

/**
 * `state=working`, same reasoning as `listEntries`: editing means seeing the
 * draft face, not just the published one.
 *
 * `options.trashed` defaults to unset (the store's own default, `exclude`) —
 * a caller that needs to tell "trashed" apart from "never existed", such as
 * the rich text editor's internal-link picker warning about a dead target,
 * passes `'include'` explicitly.
 */
export function getEntry(
  token: string,
  collection: string,
  id: string,
  options: { readonly trashed?: TrashFilter } = {},
): Promise<Entry> {
  const params = new URLSearchParams({ state: 'working' })
  if (options.trashed !== undefined) params.set('trashed', options.trashed)
  params.set('depth', '0')
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${params.toString()}`,
    { headers: authHeader(token) },
  )
}

export interface GetEntriesByIdsOptions {
  /**
   * Reaches into the trash — the only way a relation's referenced entry stays
   * resolvable once it has been trashed (ADR-0022: the join row survives a
   * trash, on purpose). Absent means excluded, the default every list route
   * applies. Reaching in needs `delete` on the target collection, same as
   * every other trash-aware read; a caller without it gets a 403 it should
   * treat the same way it treats "not found" for this one field.
   */
  readonly trashed?: TrashFilter
}

/**
 * Resolves a batch of entries by id in one request, via `filter.id.in` — the
 * only way a relation or a taxonomy-adjacent picker can show a linked
 * entry's title (and whether it is trashed) without one request per id.
 * `GET /{collection}/{id}` has no `trashed` option at all (only the list
 * route does), so a single relation's linked-but-trashed entry can only be
 * found this way.
 */
export function getEntriesByIds(
  token: string,
  collection: string,
  ids: readonly string[],
  options: GetEntriesByIdsOptions = {},
): Promise<readonly Entry[]> {
  if (ids.length === 0) return Promise.resolve([])
  const unique = [...new Set(ids)]
  const params = new URLSearchParams()
  params.set('state', 'working')
  params.set('depth', '0')
  params.set('filter.id.in', unique.join(','))
  // The list route's own ceiling (`DEFAULT_LIMITS.maxPageSize`) — a to-many
  // relation carrying more ids than that cannot be fully resolved in one
  // call; the picker still shows what came back rather than failing outright.
  params.set('limit', String(Math.min(unique.length, 100)))
  if (options.trashed !== undefined) params.set('trashed', options.trashed)
  return requestBody<{ readonly data: readonly Entry[] }>(
    `/api/content/${encodeURIComponent(collection)}?${params.toString()}`,
    { headers: authHeader(token) },
  ).then((body) => body.data)
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
  return request(`/api/content/${encodeURIComponent(collection)}?${NO_EXPANSION}`, {
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

export interface UpdateEntryOptions {
  readonly blocks?: BlockZones
  /**
   * The `updatedAt` this write was loaded against (fiche 02 task 7).
   *
   * Passed straight through to `PATCH .../{id}`'s body — absent means "last
   * write wins", exactly as before; present asks the server to refuse with
   * `CONTENT_STALE_WRITE` if somebody else's write landed first.
   */
  readonly expectedUpdatedAt?: string
}

export function updateEntry(
  token: string,
  collection: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
  options: UpdateEntryOptions = {},
): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${NO_EXPANSION}`,
    {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify({
        values,
        ...(options.blocks === undefined ? {} : { blocks: options.blocks }),
        ...(options.expectedUpdatedAt === undefined
          ? {}
          : { expectedUpdatedAt: options.expectedUpdatedAt }),
      }),
    },
  )
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

/** A word-level diff op — `packages/schema/src/store/diff.ts`'s `WordChange`. */
export type WordOp = 'equal' | 'added' | 'removed'

export interface WordChange {
  readonly op: WordOp
  readonly text: string
}

export interface FieldChange {
  readonly field: string
  readonly change: ChangeKind
  readonly before: unknown
  readonly after: unknown
  /** Word-level diff of `before`/`after`, when both are plain text (`enrichWordDiffs`). */
  readonly words?: readonly WordChange[]
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
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/restore?${NO_EXPANSION}`,
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

/** Publishes the entry's working state — `POST /{collection}/{id}/publish`. */
export function publishEntry(token: string, collection: string, id: string): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/publish?${NO_EXPANSION}`,
    { method: 'POST', headers: authHeader(token) },
  )
}

/**
 * Takes an entry off its public face, into `draft`, `archived` — or
 * `scheduled`, which needs the future `publishedAt` (ISO 8601) the entry is
 * to go public at. `update()` never changes `status`; this is the one route
 * that does.
 */
export function unpublishEntry(
  token: string,
  collection: string,
  id: string,
  status: 'draft' | 'archived' | 'scheduled' = 'draft',
  publishedAt?: string,
): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/unpublish?${NO_EXPANSION}`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ status, ...(publishedAt === undefined ? {} : { publishedAt }) }),
    },
  )
}

/** One cell of the translation dashboard's matrix (fiche 10 task 1) — absent when the key for a locale is missing. */
export interface TranslationMatrixCell {
  readonly id: string
  readonly status: string
  readonly updatedAt: string
  /** Task 2: the source's `updatedAt` is later than this translation's. Always `false` on the root's own cell. */
  readonly obsolete: boolean
}

/** One row of the matrix: a root entry (`translationOf: null`) and the state of its family, keyed by locale. */
export interface TranslationMatrixEntry {
  readonly root: Entry
  readonly cells: Readonly<Record<string, TranslationMatrixCell>>
}

export interface TranslationMatrixPage {
  readonly items: readonly TranslationMatrixEntry[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

/**
 * The translation dashboard's data: one row per root entry, every locale's
 * state in one round trip — `GET /{collection}/-/translation-matrix`, a
 * single server-side query and join (fiche 10's own "piège connu": never
 * build this with one `getTranslations` call per row).
 */
export async function getTranslationMatrix(
  token: string,
  collection: string,
  options: { readonly cursor?: string; readonly limit?: number } = {},
): Promise<TranslationMatrixPage> {
  const params = new URLSearchParams()
  if (options.cursor !== undefined) params.set('after', options.cursor)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  const query = params.toString()
  const body = await requestBody<{
    readonly data: readonly TranslationMatrixEntry[]
    readonly page: { readonly hasMore: boolean; readonly nextCursor: string | null }
  }>(
    `/api/content/${encodeURIComponent(collection)}/-/translation-matrix${query === '' ? '' : `?${query}`}`,
    { headers: authHeader(token) },
  )
  return { items: body.data, hasMore: body.page.hasMore, nextCursor: body.page.nextCursor }
}

/**
 * Per-status row counts for one collection this actor may read — `GET
 * /-/summary`'s wire shape (`@cogenta/api`'s `CollectionCounts`).
 *
 * `draft`/`scheduled`/`archived`/`trashed` are `null`, never `0`, for an
 * actor the server did not grant draft or trash access on this collection —
 * a fabricated `0` would itself be a claim about content this actor cannot
 * see.
 */
export interface CollectionCounts {
  readonly collection: string
  readonly total: number
  readonly published: number
  readonly draft: number | null
  readonly scheduled: number | null
  readonly archived: number | null
  readonly trashed: number | null
}

/**
 * One request for every readable collection's status counts — the dashboard
 * content summary widget (fiche 22 tâche 1). Never one request per
 * collection: that is exactly the N+1 the fiche's own piège warns a
 * dashboard turns into.
 */
export function getContentSummary(token: string): Promise<readonly CollectionCounts[]> {
  return request('/api/content/-/summary', { headers: authHeader(token) })
}

/** Copies the entry's working state into a new draft — never the published face. */
export function duplicateEntry(
  token: string,
  collection: string,
  id: string,
  values?: Readonly<Record<string, unknown>>,
): Promise<Entry> {
  return request(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/duplicate?${NO_EXPANSION}`,
    {
      method: 'POST',
      headers: authHeader(token),
      ...(values === undefined ? {} : { body: JSON.stringify({ values }) }),
    },
  )
}
