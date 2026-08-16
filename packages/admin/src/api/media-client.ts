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
  readonly createdAt: string
  readonly createdBy: string | null
}

export interface MediaPage {
  readonly items: readonly MediaAsset[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export interface ListMediaOptions {
  readonly kind?: MediaKind
  readonly cursor?: string
  readonly limit?: number
  /** Substring match on filename and alt text — see `media-router.ts`'s `q` handling. */
  readonly q?: string
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
}

export interface UpdateMediaInput {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string | null
  readonly focal?: FocalPoint | null
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
  const query = params.toString()

  const body = await requestBody<{
    readonly data: readonly MediaAsset[]
    readonly page: { readonly hasMore: boolean; readonly nextCursor: string | null }
  }>(`/api/media${query === '' ? '' : `?${query}`}`, { headers: authHeader(token) })
  return { items: body.data, hasMore: body.page.hasMore, nextCursor: body.page.nextCursor }
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
