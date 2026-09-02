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

/**
 * The legacy JSON-with-base64 upload (`fileToBase64` + this). Kept for a
 * headless client that already speaks it (`media-router.ts`'s own doc
 * comment: "nothing forces an existing headless client that POSTs plain
 * JSON to learn multipart"), but **not** the path the admin UI uses any
 * more — see `uploadMediaMultipart` below (fiche 05 task 1, audit
 * `05-mediatheque.md` §6 T01). Base64 inflates the payload by roughly a
 * third and `fetch` cannot report upload progress at all, which is exactly
 * what made every "uploading…" spinner in this admin a lie about how much
 * was actually left.
 */
export function uploadMedia(token: string, input: UploadMediaInput): Promise<MediaAsset> {
  return request(`/api/media`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

interface UploadResponseBody {
  readonly data?: MediaAsset
  readonly error?: { readonly code?: string; readonly message?: string; readonly hint?: string }
}

export interface MultipartUploadMetadata {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string
  readonly tags?: readonly string[]
}

/**
 * `POST /api/media` as real `multipart/form-data`, the transport
 * `media-router.ts` has actually routed to `normaliseMultipartUpload` since
 * fiche 11 task 1 — this admin never sent it, despite a comment that used
 * to claim otherwise (fiche 05 task 1, audit `05-mediatheque.md` §6 T01).
 *
 * `XMLHttpRequest`, not `fetch`: only `xhr.upload.onprogress` reports real
 * byte-level progress while a body is still being sent — `fetch` has no
 * equivalent for a request body, only for reading a response, which is the
 * wrong end for an upload.
 */
export function uploadMediaMultipart(
  token: string,
  file: File,
  metadata: MultipartUploadMetadata = {},
  onProgress?: (loaded: number, total: number) => void,
): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    // Sent explicitly, not left for the server to derive from the part's
    // own declared content type: `verifyRealType` on the server only
    // re-sniffs the bytes when `kind === 'image'`, which is exactly the
    // security check L10 added against a disguised upload — the JSON path
    // has always sent this for the same reason, and the multipart path must
    // not silently drop that protection by omission.
    form.append('kind', mediaKindFor(file.type))
    if (metadata.alt !== undefined) form.append('alt', metadata.alt)
    if (metadata.decorative !== undefined) form.append('decorative', String(metadata.decorative))
    if (metadata.decorativeJustification !== undefined) {
      form.append('decorativeJustification', metadata.decorativeJustification)
    }
    if (metadata.tags !== undefined && metadata.tags.length > 0) {
      form.append('tags', metadata.tags.join(','))
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/media`)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total)
    }
    xhr.onload = () => {
      let body: UploadResponseBody | null = null
      try {
        body = JSON.parse(xhr.responseText) as UploadResponseBody
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.data !== undefined) {
        resolve(body.data)
        return
      }
      reject(
        new ApiError(
          body?.error?.code ?? 'INTERNAL',
          body?.error?.message ?? 'Could not upload this file.',
          body?.error?.hint,
        ),
      )
    }
    xhr.onerror = () => {
      reject(new ApiError('INTERNAL', 'The upload failed before reaching the server.', undefined))
    }
    xhr.onabort = () => {
      reject(new ApiError('INTERNAL', 'The upload was cancelled.', undefined))
    }
    xhr.send(form)
  })
}

export interface MediaLimits {
  readonly maxUploadBytes: number
  readonly acceptedMimeTypes: readonly string[]
}

/** `GET /api/media/-/limits` — shown before the first file is picked, so a rejection is never the surprise. */
export function getMediaLimits(token: string): Promise<MediaLimits> {
  return request(`/api/media/-/limits`, { headers: authHeader(token) })
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
