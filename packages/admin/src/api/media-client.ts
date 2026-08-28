import { API_BASE, ApiError, authHeader, request, requestBody } from './http.js'

/**
 * The thin fetch layer over `/api/media/*` — copied by hand from the wire
 * shape `packages/api/src/rest/media-router.ts` actually returns, same
 * reason `content-client.ts` copies the content route's shape.
 */

export const MEDIA_KINDS = ['image', 'video', 'audio', 'file'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export interface FocalPoint {
  readonly x: number
  readonly y: number
}

export interface MediaAsset {
  readonly id: string
  readonly kind: MediaKind
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  readonly width: number | null
  readonly height: number | null
  readonly alt: string
  readonly decorative: boolean
  readonly decorativeJustification: string | null
  readonly focal: FocalPoint | null
  readonly tags: readonly string[]
  readonly contentHash: string
  /** `null` means unclassified — fiche 46's default for every asset uploaded before folders existed. */
  readonly folderId: string | null
  readonly createdAt: string
  readonly createdBy: string | null
}

export interface MediaPage {
  readonly items: readonly MediaAsset[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
  /** Absent only for the free-text `q` path over a bounded scan — see `media-router.ts`'s own comment. */
  readonly total?: number
}

export type MediaSortField = 'createdAt' | 'filename' | 'size'
export type SortDirection = 'asc' | 'desc'

export interface ListMediaOptions {
  readonly kind?: MediaKind
  readonly cursor?: string
  readonly limit?: number
  /** Substring match on filename and alt text — see `media-router.ts`'s `q` handling. */
  readonly q?: string
  /** Exact match on one tag. */
  readonly tag?: string
  readonly sort?: MediaSortField
  readonly direction?: SortDirection
  readonly from?: string
  readonly to?: string
  /** `null` means unclassified (`folder_id is null`). Absent means no folder filter. */
  readonly folderId?: string | null
  /** With a real `folderId`, also matches every descendant folder. */
  readonly includeSubfolders?: boolean
}

export interface UploadMediaInput {
  readonly kind: MediaKind
  readonly filename: string
  readonly mimeType: string
  readonly data: string
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string
  readonly focal?: FocalPoint
  readonly tags?: readonly string[]
  readonly folderId?: string | null
}

export interface UpdateMediaInput {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string | null
  readonly focal?: FocalPoint | null
  readonly tags?: readonly string[]
}

export interface MediaUsageMatch {
  readonly collection: string
  readonly entryId: string
  readonly field: string
}

export interface MediaUsageReport {
  readonly matches: readonly MediaUsageMatch[]
  readonly scannedEntries: number
  readonly truncated: boolean
}

export interface ExifGps {
  readonly latitude: number
  readonly longitude: number
}

export interface ExifData {
  readonly make: string | null
  readonly model: string | null
  readonly takenAt: string | null
  readonly gps: ExifGps | null
}

export interface BulkFailure {
  readonly id: string
  readonly code: string
  readonly message: string
}

/** A folder in the media library's tree — mirrors `@cogenta/core`'s `MediaFolder`. */
export interface MediaFolder {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly path: string
  readonly position: number
  readonly createdAt: string
}

/** `kind` from a MIME type — the same three-way split the store's own field kinds accept. */
export function mediaKindFor(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * A `File` read into the base64 string the upload route expects.
 *
 * `FileReader.readAsDataURL`, not `file.arrayBuffer()`: the latter is a
 * newer addition to the `Blob` interface that not every environment this
 * admin runs in implements yet, `FileReader` is the one every browser (and
 * jsdom, for tests) actually has.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read the file.'))
        return
      }
      // A data URL: "data:<mime>;base64,<payload>" — only the payload is sent.
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

export async function listMedia(token: string, options: ListMediaOptions = {}): Promise<MediaPage> {
  const params = new URLSearchParams()
  if (options.kind !== undefined) params.set('kind', options.kind)
  if (options.cursor !== undefined) params.set('after', options.cursor)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  if (options.q !== undefined && options.q.trim().length > 0) params.set('q', options.q)
  if (options.tag !== undefined && options.tag.trim().length > 0) params.set('tag', options.tag)
  if (options.sort !== undefined) params.set('sort', options.sort)
  if (options.direction !== undefined) params.set('direction', options.direction)
  if (options.from !== undefined) params.set('from', options.from)
  if (options.to !== undefined) params.set('to', options.to)
  if (options.folderId !== undefined) {
    params.set('folderId', options.folderId === null ? 'none' : options.folderId)
  }
  if (options.includeSubfolders === true) params.set('includeSubfolders', '1')
  const query = params.toString()

  const body = await requestBody<{
    readonly data: readonly MediaAsset[]
    readonly page: {
      readonly hasMore: boolean
      readonly nextCursor: string | null
      readonly total?: number
    }
  }>(`/api/media${query === '' ? '' : `?${query}`}`, { headers: authHeader(token) })
  return {
    items: body.data,
    hasMore: body.page.hasMore,
    nextCursor: body.page.nextCursor,
    ...(body.page.total === undefined ? {} : { total: body.page.total }),
  }
}

export function uploadMedia(token: string, input: UploadMediaInput): Promise<MediaAsset> {
  return request(`/api/media`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function getMedia(token: string, id: string): Promise<MediaAsset> {
  return request(`/api/media/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export function updateMedia(
  token: string,
  id: string,
  input: UpdateMediaInput,
): Promise<MediaAsset> {
  return request(`/api/media/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteMedia(token: string, id: string): Promise<void> {
  await request(`/api/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function getMediaUsage(token: string, id: string): Promise<MediaUsageReport> {
  return request(`/api/media/${encodeURIComponent(id)}/usage`, { headers: authHeader(token) })
}

/** `null` for a non-image asset, or a JPEG with no EXIF block — see `media-router.ts`'s own comment. */
export function getMediaExif(token: string, id: string): Promise<ExifData | null> {
  return request(`/api/media/${encodeURIComponent(id)}/exif`, { headers: authHeader(token) })
}

/**
 * `POST /api/media/{id}/replace` (fiche 11 task 4, wired into the admin by
 * fiche 46) — overwrites the file behind an id, keeping every reference to
 * it working. Multipart-only on the server, so this is the one media write
 * in this client that cannot go through `request`'s JSON body: a raw
 * `fetch` with a `FormData` body, the same shape `fetchMediaBlobUrl` below
 * already uses for the one other route that cannot be plain JSON.
 */
export async function replaceMedia(token: string, id: string, file: File): Promise<MediaAsset> {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${API_BASE}/api/media/${encodeURIComponent(id)}/replace`, {
    method: 'POST',
    headers: authHeader(token),
    body: form,
  })
  const body = (await response.json().catch(() => null)) as {
    readonly data?: MediaAsset
    readonly error?: { readonly code?: string; readonly message?: string; readonly hint?: string }
  } | null
  if (!response.ok) {
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? 'Could not replace this file.',
      body?.error?.hint,
    )
  }
  if (body?.data === undefined) {
    throw new ApiError('INTERNAL', 'The server did not return the replaced asset.', undefined)
  }
  return body.data
}

export async function bulkDeleteMedia(
  token: string,
  ids: readonly string[],
): Promise<{ readonly deleted: readonly string[]; readonly failed: readonly BulkFailure[] }> {
  return request(`/api/media/-/bulk-delete`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ ids }),
  })
}

function bulkTag(
  token: string,
  endpoint: 'bulk-tag' | 'bulk-untag',
  ids: readonly string[],
  tag: string,
): Promise<{ readonly updated: readonly MediaAsset[]; readonly failed: readonly BulkFailure[] }> {
  return request(`/api/media/-/${endpoint}`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ ids, tag }),
  })
}

export const bulkAddTag = (
  token: string,
  ids: readonly string[],
  tag: string,
): ReturnType<typeof bulkTag> => bulkTag(token, 'bulk-tag', ids, tag)

export const bulkRemoveTag = (
  token: string,
  ids: readonly string[],
  tag: string,
): ReturnType<typeof bulkTag> => bulkTag(token, 'bulk-untag', ids, tag)

export function moveMedia(token: string, id: string, folderId: string | null): Promise<MediaAsset> {
  return request(`/api/media/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ folderId }),
  })
}

export async function bulkMoveMedia(
  token: string,
  ids: readonly string[],
  folderId: string | null,
): Promise<{ readonly moved: readonly MediaAsset[]; readonly failed: readonly BulkFailure[] }> {
  return request(`/api/media/-/bulk-move`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ ids, folderId }),
  })
}

// ---------------------------------------------------------------- folders (fiche 46)

/** The whole tree (flattened, `parentId`/`path` intact) when `parentId` is omitted; one level when given (`null` for the roots). */
export async function listMediaFolders(
  token: string,
  parentId?: string | null,
): Promise<readonly MediaFolder[]> {
  const query =
    parentId === undefined
      ? ''
      : `?parentId=${parentId === null ? '' : encodeURIComponent(parentId)}`
  return request(`/api/media/folders${query}`, { headers: authHeader(token) })
}

export function createMediaFolder(
  token: string,
  input: { readonly name: string; readonly parentId?: string | null },
): Promise<MediaFolder> {
  return request(`/api/media/folders`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

/** Renames and/or repositions — never reparents, that is `moveMediaFolder`. */
export function updateMediaFolder(
  token: string,
  id: string,
  input: { readonly name?: string; readonly position?: number },
): Promise<MediaFolder> {
  return request(`/api/media/folders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function moveMediaFolder(
  token: string,
  id: string,
  parentId: string | null,
): Promise<MediaFolder> {
  return request(`/api/media/folders/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ parentId }),
  })
}

/** Refuses (throws `ApiError` with code `MEDIA_FOLDER_NOT_EMPTY`) while the folder still has subfolders or media in it. */
export async function deleteMediaFolder(token: string, id: string): Promise<void> {
  await request(`/api/media/folders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/**
 * A `blob:` URL for the stored file, good until `URL.revokeObjectURL` is
 * called on it.
 *
 * `<img src>` cannot carry a bearer token — only `fetch` can — so a plain
 * `/api/media/{id}/file` URL would 401 the moment the browser requests it.
 * Fetching the bytes and handing back an object URL is what lets a thumbnail
 * stay behind the same authentication every other admin request goes
 * through, instead of the file route being made unauthenticated to work
 * around it.
 */
export async function fetchMediaBlobUrl(token: string, id: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/media/${encodeURIComponent(id)}/file`, {
    headers: authHeader(token),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      readonly error?: { readonly code?: string; readonly message?: string; readonly hint?: string }
    } | null
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? 'Could not load the file.',
      body?.error?.hint,
    )
  }
  return URL.createObjectURL(await response.blob())
}
