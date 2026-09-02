import { createHash, randomUUID } from 'node:crypto'
import {
  CogentaError,
  describeContainer,
  type FocalPoint,
  hasGpsData,
  MEDIA_KINDS,
  type MediaAsset,
  type MediaFolderStore,
  type MediaKind,
  type MediaSortField,
  type MediaStore,
  readExif,
  type StorageDriver,
  sniffImageFormat,
  stripGpsFromJpeg,
} from '@cogenta/core'
import type { CollectionDefinition, ContentStore, MediaUsageReport } from '@cogenta/schema'
import { findMediaUsage } from '@cogenta/schema'
import { z } from 'zod'
import type { Actor } from '../types.js'
import {
  errorResponse,
  jsonResponse,
  queryError,
  type RestRequest,
  type RestResponse,
} from './http.js'
import { isMultipartFormData, type MultipartFile, type MultipartFormData } from './multipart.js'
import { single } from './query.js'

/**
 * `/api/media` — upload, list, read, edit, replace, tag and delete media
 * assets (fiche 11 — the media library rewrite).
 *
 * Every route here requires an authenticated actor (`actor.id !== null`):
 * there is no per-collection permission model for media the way there is for
 * content, so the only gate today is "signed in at all" — a known gap,
 * tightened once L4's agent tool permissions land (contract C already names
 * `media.read`/`media.write` scopes for that).
 *
 * **Two upload transports, both live.** `multipart/form-data` is the real
 * one (fiche 11 task 1) — a `FormData` upload streams to the server without
 * the ~33% base64 inflation the JSON path pays, and is what every admin
 * upload uses from here on. The legacy JSON-with-base64-`data` body (L2's
 * original shape) is still accepted: nothing forces an existing headless
 * client that POSTs plain JSON to learn multipart, and refusing it would be
 * a breaking change this rewrite does not need to make. `upload()` tells
 * the two apart structurally (`isMultipartFormData`), not by header.
 */

/** The intrinsic size of an image, in its own pixels. */
export interface ImageSize {
  readonly width: number
  readonly height: number
}

/** One derived rendition, ready to be written next to the original. */
export interface UploadedImageVariant {
  /** Suffix under the asset's variant prefix — `640.webp`. Never a full key. */
  readonly name: string
  readonly bytes: Uint8Array
  readonly contentType: string
}

/**
 * Image processing at upload time, injected rather than imported.
 *
 * `@cogenta/render` owns the pipeline (sharp or WASM libvips, `planTransform`,
 * the `srcset` ladder) and this package must not depend on it: a REST
 * transport has no business pulling a 12 MB WebAssembly dependency into its
 * tree. So the router takes this interface and `@cogenta/cli` supplies the
 * implementation built from the real driver registry — the same shape rule
 * every other driver in the project follows.
 *
 * Absent means "no image processing": uploads still work, they simply carry
 * no dimensions and no variants. Rule R2's shape, applied to images.
 */
export interface MediaImageProcessor {
  /** Intrinsic size, or null when the bytes cannot be read as an image. */
  probe(bytes: Uint8Array): Promise<ImageSize | null>
  /** The renditions to store beside the original, for an image of this size. */
  variants(bytes: Uint8Array, intrinsic: ImageSize): Promise<readonly UploadedImageVariant[]>
  /**
   * The names `variants()` would produce for this size.
   *
   * Deleting needs it: `StorageDriver` has no `list`, so the only way to
   * clean up an asset's renditions is to know what they were called. Keeping
   * it deterministic — a fixed ladder, not a per-upload decision — is what
   * makes that possible at all.
   */
  variantNames(intrinsic: ImageSize): readonly string[]
}

/**
 * What `GET /api/media/{id}/usage` and the bulk-delete warning need: a
 * bounded scan across the site's real content (`@cogenta/schema`'s
 * `findMediaUsage`, fiche 11 task 3). Optional, the same way
 * `TaxonomyUsageSource` is optional on `createTaxonomyRouter` — a caller
 * with no collections wired still gets a working media library, just with
 * every usage check answering "nothing found" rather than "not checked".
 */
export interface MediaUsageSource {
  readonly collections: readonly CollectionDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  /** Caps one usage scan. Defaults to `findMediaUsage`'s own default (5000). */
  readonly maxEntries?: number
}

/** What the admin shows *before* a file picker opens (fiche 11 task 1). */
export interface MediaUploadLimits {
  readonly maxUploadBytes?: number
  readonly acceptedMimeTypes?: readonly string[]
}

export interface MediaRouterOptions {
  readonly store: MediaStore
  readonly storage: StorageDriver
  /**
   * The folder tree (fiche 46). Absent means the folder-management routes
   * (`/api/media/folders/*`, `/{id}/move`, `/-/bulk-move`) all answer 404 —
   * the same "not mounted" degradation `usage` already models. `GET
   * /api/media?folderId=` still works without it (an exact match on the
   * `MediaStore` column needs no tree); only `?includeSubfolders=1` needs
   * this to resolve the subtree, and is ignored (falls back to the exact
   * match) when it is absent. A real server (`cogenta serve`) always wires
   * this; only a router built directly for a narrower test omits it.
   */
  readonly folders?: MediaFolderStore
  /**
   * Generates resized/re-encoded variants at upload time (L10 task 5).
   *
   * Absent by default: the pipeline is optional, and an install without it
   * uploads and serves originals exactly as before.
   */
  readonly images?: MediaImageProcessor
  /** Wires `GET .../usage` and the informed-deletion warning. Absent: usage always reports empty. */
  readonly usage?: MediaUsageSource
  readonly limits?: MediaUploadLimits
  /**
   * The upload size ceiling actually enforced, in bytes (fiche 23 task 2 —
   * the "Médias" tab's `media.maxUploadSizeMb` setting). A function, not a
   * plain number: it is backed by a database row that can change without a
   * redeploy, so this is read fresh on every upload/replace rather than
   * baked in when the router is constructed. Absent means `limits`'s static
   * `maxUploadBytes` (or `DEFAULT_MAX_UPLOAD_BYTES` if that is absent too),
   * unchanged from before fiche 23.
   */
  readonly maxUploadBytes?: () => Promise<number>
  /** Mount point. `/api/media` by default. */
  readonly basePath?: string
}

export interface MediaRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/media'

/**
 * The default cap on a *decoded* upload, whichever transport carried it.
 *
 * Generous enough for a real photo report or a short video, small enough
 * that a request body is never the resource-exhaustion vector — and
 * configurable per site via `MediaRouterOptions.limits`, since what a shared
 * host's own body-size limit allows varies (fiche 11 task 1: "limites lues
 * depuis la configuration").
 */
const DEFAULT_MAX_UPLOAD_BYTES = 250 * 1024 * 1024

const DEFAULT_ACCEPTED_MIME_TYPES: readonly string[] = [
  'image/avif',
  'image/webp',
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'application/pdf',
]

// How many of the most recent assets `q` scans in memory. `MediaStore.list`
// has no substring filter of its own; this bounds the cost of one without a
// migration, at the price of never finding an old asset outside this window.
const MEDIA_SEARCH_SCAN_LIMIT = 200

const MEDIA_SORT_FIELDS: readonly MediaSortField[] = ['createdAt', 'filename', 'size']

const focalSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })

const uploadSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  data: z.string().min(1),
  alt: z.string().max(2000).optional(),
  decorative: z.boolean().optional(),
  decorativeJustification: z.string().max(2000).optional(),
  focal: focalSchema.optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
  /** Strips EXIF GPS coordinates from a JPEG original. Defaults to `true` — see the module doc. */
  stripGps: z.boolean().optional(),
})

const updateSchema = z.object({
  alt: z.string().max(2000).optional(),
  decorative: z.boolean().optional(),
  decorativeJustification: z.string().max(2000).nullable().optional(),
  focal: focalSchema.nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
})

const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
})

const bulkTagSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  tag: z.string().min(1).max(100),
})

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().min(1).nullable().optional(),
})

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  position: z.number().int().min(0).optional(),
})

const moveFolderSchema = z.object({
  parentId: z.string().min(1).nullable(),
})

const moveMediaSchema = z.object({
  folderId: z.string().min(1).nullable(),
})

const bulkMoveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  folderId: z.string().min(1).nullable(),
})

function decode<TSchema extends z.ZodType>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const result = schema.safeParse(body ?? {})
  if (result.success) return result.data

  const paths = result.error.issues
    .map((issue) => issue.path.join('.'))
    .filter((path) => path.length > 0)

  throw new CogentaError({
    code: 'MEDIA_INVALID',
    message:
      paths.length === 0
        ? 'The request body is not in the shape this route expects.'
        : `The request body is invalid at: ${paths.join(', ')}.`,
    hint: 'Send an object with the fields this route expects.',
  })
}

function requireActor(actor: Actor): void {
  if (actor.id === null) {
    throw new CogentaError({
      code: 'UNAUTHENTICATED',
      message: 'Sign in to manage media.',
      hint: 'Send a bearer token from a valid session.',
    })
  }
}

/** Letters, digits, dot, dash, underscore — the same whitelist `StorageDriver` keys require. */
function sanitiseFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/gu, '-')
  return cleaned.length === 0 ? 'file' : cleaned
}

/** `kind` from a MIME type — the same three-way split the admin's own client-side helper uses. */
function mediaKindFromMime(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
}

/** A short, stable digest of the bytes actually stored — never the declared type or filename, which say nothing about a replace. */
function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

function tooLargeError(maxBytes: number): CogentaError {
  return new CogentaError({
    code: 'MEDIA_INVALID',
    message: `The file is larger than the ${Math.floor(maxBytes / (1024 * 1024))}MB this route accepts.`,
    hint: 'Upload a smaller file, or ask an operator to raise the configured limit.',
  })
}

function decodeBase64(data: string, maxBytes: number): Buffer {
  const buffer = Buffer.from(data, 'base64')
  // A non-base64 string decodes to *something* rather than throwing, so the
  // only reliable check is round-tripping it back and comparing lengths.
  if (buffer.length === 0 && data.trim().length > 0) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'The uploaded data is not valid base64.',
      hint: 'Encode the file contents as base64 before sending them.',
    })
  }
  if (buffer.length > maxBytes) throw tooLargeError(maxBytes)
  return buffer
}

/**
 * The real-type check images get: the format is read from the bytes, never
 * from `mimeType` or the filename extension — both are attacker-controlled,
 * and "upload a disguised file" is a named security test for this route
 * (L2-admin.md). Only images are sniffed in this pass; video/audio/file
 * uploads are stored as declared.
 */
/**
 * The content type an image is stored and served with — derived from the
 * bytes, never from what the uploader declared.
 *
 * Sniffing already decided whether the file *is* an image; trusting
 * `mimeType` for the response header after that is the hole it left open. An
 * editor could upload a genuine PNG, declare it `text/html`, and have the
 * delivery endpoint serve it as a document on the site's own origin —
 * `X-Content-Type-Options: nosniff` does not help, because the declared type
 * *is* the executable one. Found by the security review of L10 task 5.
 */
const CONTENT_TYPE_BY_FORMAT: Readonly<Record<string, string>> = Object.freeze({
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
})

/**
 * Checks an image is really an image, and answers with the content type its
 * bytes earn. `null` for every other kind, which is stored as declared —
 * those are never served on a public, unauthenticated route.
 */
function verifyRealType(kind: MediaKind, bytes: Buffer): string | null {
  if (kind !== 'image') return null

  const format = sniffImageFormat(bytes)
  if (format !== null) return CONTENT_TYPE_BY_FORMAT[format] ?? 'application/octet-stream'

  throw new CogentaError({
    code: 'MEDIA_TYPE_REJECTED',
    message: `This file is ${describeContainer(bytes)}, not a supported image.`,
    hint: 'Upload AVIF, WebP, JPEG or PNG. SVGs are refused by default (ADR-0017) until a reviewed sanitizer exists.',
  })
}

function storageKeyFor(id: string, filename: string): string {
  return `media/${id}/${sanitiseFilename(filename)}`
}

/**
 * Where a derived rendition lives.
 *
 * Under the asset's own prefix, in a `variants/` folder of its own, so that
 * "everything belonging to this asset" stays one path prefix on every storage
 * driver — and so that a variant name can never collide with the original
 * filename however the uploader named it.
 */
export function variantKeyFor(id: string, name: string): string {
  return `media/${id}/variants/${sanitiseFilename(name)}`
}

/** What every upload path (multipart or legacy JSON) converges on before the shared write logic runs. */
interface NormalisedUpload {
  readonly kind: MediaKind
  readonly filename: string
  readonly mimeType: string
  readonly bytes: Buffer
  readonly alt: string
  readonly decorative: boolean
  readonly decorativeJustification: string | undefined
  readonly focal: FocalPoint | undefined
  readonly tags: readonly string[]
  readonly stripGps: boolean
}

function parseFocalField(raw: string): FocalPoint | undefined {
  if (raw.trim().length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'The "focal" field is not valid JSON.',
      hint: 'Send `{"x":0..1,"y":0..1}` as a JSON string.',
    })
  }
  const result = focalSchema.safeParse(parsed)
  if (!result.success) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'The "focal" field is not a usable focal point.',
      hint: 'Send `{"x":0..1,"y":0..1}`.',
    })
  }
  return result.data
}

function parseBooleanField(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  return raw === 'true' || raw === '1'
}

function normaliseMultipartUpload(form: MultipartFormData): NormalisedUpload {
  const file = form.files.find((candidate: MultipartFile) => candidate.fieldName === 'file')
  if (file === undefined) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'No file part named "file" was found in the upload.',
      hint: 'Send the file under a field named "file" in the multipart body.',
    })
  }

  const kindField = form.fields['kind']
  const kind =
    kindField !== undefined && (MEDIA_KINDS as readonly string[]).includes(kindField)
      ? (kindField as MediaKind)
      : mediaKindFromMime(file.mimeType)

  const tagsField = form.fields['tags']
  const tags =
    tagsField === undefined || tagsField.trim().length === 0
      ? []
      : tagsField
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)

  return {
    kind,
    filename: file.filename,
    mimeType: file.mimeType,
    bytes: Buffer.from(file.data),
    alt: form.fields['alt'] ?? '',
    decorative: parseBooleanField(form.fields['decorative'], false),
    decorativeJustification: form.fields['decorativeJustification'],
    focal: form.fields['focal'] === undefined ? undefined : parseFocalField(form.fields['focal']),
    tags,
    stripGps: parseBooleanField(form.fields['stripGps'], true),
  }
}

export function createMediaRouter(options: MediaRouterOptions): MediaRouter {
  const { store, storage } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const maxUploadBytes = options.limits?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  const acceptedMimeTypes = options.limits?.acceptedMimeTypes ?? DEFAULT_ACCEPTED_MIME_TYPES

  return {
    handle: async (request, actor) => {
      try {
        return await route(request, actor)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, actor: Actor): Promise<RestResponse> {
    const segments = segmentsOf(request.path, basePath)
    if (segments === null) throw noRoute()

    const method = request.method.toUpperCase()

    if (segments.length === 0) {
      if (method === 'GET') return list(request, actor)
      if (method === 'POST') return upload(request, actor)
      return methodNotAllowed(['GET', 'POST'])
    }

    const [first, second] = segments

    if (first === '-') {
      if (second === 'limits') {
        if (method !== 'GET') return methodNotAllowed(['GET'])
        requireActor(actor)
        return jsonResponse(200, { data: { maxUploadBytes, acceptedMimeTypes } })
      }
      if (second === 'bulk-delete') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return bulkDelete(request, actor)
      }
      if (second === 'bulk-tag') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return bulkTag(request, actor, 'add')
      }
      if (second === 'bulk-untag') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return bulkTag(request, actor, 'remove')
      }
      if (second === 'bulk-move') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return bulkMove(request, actor)
      }
      if (second === 'bulk-usage') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return bulkUsage(request, actor)
      }
      throw noRoute()
    }

    // The folder tree (fiche 46) — a `MediaFolder`, not an asset, so its own
    // prefix rather than overloading `/api/media/{id}` with a second meaning
    // for what `id` names. Same "reserved segment" convention `-` already
    // uses for bulk routes above.
    if (first === 'folders') {
      return routeFolders(segments.slice(1), method, request, actor)
    }

    if (segments.length === 1) {
      const [id] = segments as [string]
      if (method === 'GET') return read(id, actor)
      if (method === 'PATCH' || method === 'PUT') return update(id, request, actor)
      if (method === 'DELETE') return remove(id, actor)
      return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
    }

    if (segments.length === 2) {
      const [id, sub] = segments as [string, string]
      if (sub === 'usage') {
        if (method !== 'GET') return methodNotAllowed(['GET'])
        return usageOf(id, actor)
      }
      if (sub === 'exif') {
        if (method !== 'GET') return methodNotAllowed(['GET'])
        return exifOf(id, actor)
      }
      if (sub === 'replace') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return replace(id, request, actor)
      }
      if (sub === 'move') {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        return moveAsset(id, request, actor)
      }
    }

    throw noRoute()
  }

  /** `/api/media/folders/*` (fiche 46). 404 whenever `options.folders` was not wired — see its own doc comment. */
  async function routeFolders(
    rest: readonly string[],
    method: string,
    request: RestRequest,
    actor: Actor,
  ): Promise<RestResponse> {
    const folders = options.folders
    if (folders === undefined) throw noRoute()

    if (rest.length === 0) {
      if (method === 'GET') return listFolders(folders, request, actor)
      if (method === 'POST') return createFolder(folders, request, actor)
      return methodNotAllowed(['GET', 'POST'])
    }

    if (rest.length === 1) {
      const [id] = rest as [string]
      if (method === 'GET') return readFolder(folders, id, actor)
      if (method === 'PATCH' || method === 'PUT') return updateFolder(folders, id, request, actor)
      if (method === 'DELETE') return deleteFolder(folders, id, actor)
      return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
    }

    if (rest.length === 2 && rest[1] === 'move') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      return moveFolder(folders, rest[0] as string, request, actor)
    }

    throw noRoute()
  }

  /**
   * `?folderId=`/`?includeSubfolders=` on `GET /api/media` (fiche 46).
   *
   * `folderId=none` means "unclassified" (`folder_id is null`), a real,
   * listable state — anything else is taken as a literal folder id.
   * `includeSubfolders=1` (with a real id, `none` has no subtree) resolves
   * the whole subtree through `MediaFolderStore.subtreeIds` first, and the
   * request becomes a `folderIds` match instead of a plain `folderId`
   * equality — `MediaStore` itself never needs to know what a subtree is
   * (see `ListMediaOptions.folderIds`'s own doc comment). Without
   * `options.folders` wired, `includeSubfolders` is silently ignored and the
   * request degrades to the exact match alone.
   */
  async function resolveFolderFilter(
    request: RestRequest,
  ): Promise<{ readonly folderId?: string | null; readonly folderIds?: readonly string[] }> {
    const raw = single(request.query, 'folderId')
    if (raw === undefined) return {}
    const folderId = raw === 'none' ? null : raw

    const includeSubfolders = ['1', 'true'].includes(
      single(request.query, 'includeSubfolders') ?? '',
    )
    if (!includeSubfolders || folderId === null || options.folders === undefined) {
      return { folderId }
    }

    const ids = await options.folders.subtreeIds(folderId)
    return { folderIds: ids }
  }

  async function list(request: RestRequest, actor: Actor): Promise<RestResponse> {
    // The media library is an admin screen, not a public catalogue. Listing it
    // anonymously handed out every asset's id, filename and storage key —
    // including for content nobody has published — and the ids are what a
    // public delivery endpoint like `/_image` is keyed on, so an open list
    // turns an unguessable URL into an enumerable one. Found by the security
    // review of L10 task 5, which introduced that endpoint; the doc comment
    // at the top of this file had claimed this gate existed since L2.
    requireActor(actor)
    const kind = single(request.query, 'kind')
    if (kind !== undefined && !(MEDIA_KINDS as readonly string[]).includes(kind)) {
      throw queryError('kind', 'is not a media kind', `Use one of: ${MEDIA_KINDS.join(', ')}.`)
    }
    const limitRaw = single(request.query, 'limit')
    const limit = limitRaw === undefined ? undefined : Number(limitRaw)
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw queryError('limit', 'is not a page size', 'Pass a whole number of 1 or more.')
    }
    const cursor = single(request.query, 'after')
    const q = single(request.query, 'q')
    const tag = single(request.query, 'tag')

    const from = parseDateBound('from', single(request.query, 'from'))
    const to = parseDateBound('to', single(request.query, 'to'))

    const folderFilter = await resolveFolderFilter(request)

    const sortRaw = single(request.query, 'sort')
    if (sortRaw !== undefined && !(MEDIA_SORT_FIELDS as readonly string[]).includes(sortRaw)) {
      throw queryError(
        'sort',
        'is not a sort field',
        `Use one of: ${MEDIA_SORT_FIELDS.join(', ')}.`,
      )
    }
    const sort = sortRaw as MediaSortField | undefined
    const directionRaw = single(request.query, 'direction')
    if (directionRaw !== undefined && directionRaw !== 'asc' && directionRaw !== 'desc') {
      throw queryError('direction', 'is not a sort direction', 'Use "asc" or "desc".')
    }
    const direction = directionRaw as 'asc' | 'desc' | undefined

    const commonFilters = {
      ...(kind === undefined ? {} : { kind: kind as MediaKind }),
      ...(tag === undefined ? {} : { tag }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...folderFilter,
    }

    // No dedicated index for media: `q` is a substring match on filename and
    // alt text, applied in memory over a bounded scan from the store. Good
    // enough for the volume an admin media library holds today (the header
    // search this route feeds); a real index is `@cogenta/schema`'s search
    // engine, built for content, not for a handful of asset fields.
    if (q !== undefined && q.trim().length > 0) {
      const needle = q.trim().toLowerCase()
      const scanned = await store.list({ ...commonFilters, limit: MEDIA_SEARCH_SCAN_LIMIT })
      const matches = scanned.items.filter(
        (asset) =>
          asset.filename.toLowerCase().includes(needle) || asset.alt.toLowerCase().includes(needle),
      )
      const pageSize = limit ?? matches.length
      return jsonResponse(200, {
        data: matches.slice(0, pageSize),
        page: { hasMore: false, nextCursor: null, total: matches.length },
      })
    }

    const [page, total] = await Promise.all([
      store.list({
        ...commonFilters,
        ...(sort === undefined ? {} : { sort }),
        ...(direction === undefined ? {} : { direction }),
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
      }),
      store.count(commonFilters),
    ])
    return jsonResponse(200, {
      data: page.items,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor, total },
    })
  }

  /**
   * The ceiling actually enforced for this request (fiche 23 task 2): the
   * dynamic, database-backed setting when the caller wired one, read fresh
   * every time rather than once at router construction — otherwise the
   * static `limits`-derived value unchanged from before fiche 23.
   */
  async function effectiveMaxUploadBytes(): Promise<number> {
    return options.maxUploadBytes === undefined ? maxUploadBytes : await options.maxUploadBytes()
  }

  async function upload(request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const maxBytes = await effectiveMaxUploadBytes()

    const normalised = isMultipartFormData(request.body)
      ? normaliseMultipartUpload(request.body)
      : legacyJsonUpload(request.body, maxBytes)

    return finishUpload(normalised, actor, maxBytes)
  }

  function legacyJsonUpload(body: unknown, maxBytes: number): NormalisedUpload {
    const input = decode(uploadSchema, body)
    const bytes = decodeBase64(input.data, maxBytes)
    return {
      kind: input.kind,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes,
      alt: input.alt ?? '',
      decorative: input.decorative ?? false,
      decorativeJustification: input.decorativeJustification,
      focal: input.focal,
      tags: input.tags ?? [],
      stripGps: input.stripGps ?? true,
    }
  }

  async function finishUpload(
    input: NormalisedUpload,
    actor: Actor,
    maxBytes: number,
  ): Promise<RestResponse> {
    if (input.bytes.length > maxBytes) throw tooLargeError(maxBytes)

    // For an image this is the type the *bytes* say, not the one the uploader
    // typed — the asset record and every response built from it use it, so a
    // disguised type cannot travel back out as a `Content-Type`.
    const mimeType = verifyRealType(input.kind, input.bytes) ?? input.mimeType

    // GPS scrub, before anything else touches the bytes (fiche 11 task 6):
    // the stored original and every variant derived from it must carry
    // neither, and this is the one point every upload path passes through.
    let bytes = input.bytes
    if (
      input.stripGps &&
      input.kind === 'image' &&
      sniffImageFormat(bytes) === 'jpeg' &&
      hasGpsData(bytes)
    ) {
      bytes = Buffer.from(stripGpsFromJpeg(bytes))
    }

    const id = randomUUID()
    const storageKey = storageKeyFor(id, input.filename)

    await storage.put(storageKey, bytes, { contentType: mimeType })

    // Dimensions and renditions, once, at upload — not on every request
    // (L10 task 5). A failure here must not lose the upload: the original is
    // already stored and the asset is what the editor asked for, so a missing
    // variant degrades to "served at full size", never to "upload refused".
    const written: string[] = []
    let intrinsic: ImageSize | null = null
    if (options.images !== undefined && input.kind === 'image') {
      try {
        intrinsic = await options.images.probe(bytes)
        if (intrinsic !== null) {
          for (const variant of await options.images.variants(bytes, intrinsic)) {
            const key = variantKeyFor(id, variant.name)
            await storage.put(key, Buffer.from(variant.bytes), {
              contentType: variant.contentType,
            })
            written.push(key)
          }
        }
      } catch {
        for (const key of written) await storage.delete(key).catch(() => undefined)
        written.length = 0
      }
    }

    let asset: MediaAsset
    try {
      asset = await store.create({
        id,
        kind: input.kind,
        filename: input.filename,
        mimeType,
        size: bytes.length,
        ...(intrinsic === null ? {} : { width: intrinsic.width, height: intrinsic.height }),
        alt: input.alt,
        decorative: input.decorative,
        ...(input.decorativeJustification === undefined
          ? {}
          : { decorativeJustification: input.decorativeJustification }),
        ...(input.focal === undefined ? {} : { focal: input.focal }),
        storageKey,
        tags: input.tags,
        contentHash: hashBytes(bytes),
        createdBy: actor.id,
      })
    } catch (error) {
      // The asset row is what makes the upload real; if it is refused (an
      // invalid alt-text/decorative combination), the blob must not become
      // an orphan nothing ever lists or cleans up. Its variants neither.
      await storage.delete(storageKey).catch(() => undefined)
      for (const key of written) await storage.delete(key).catch(() => undefined)
      throw error
    }

    return jsonResponse(201, { data: asset })
  }

  async function read(id: string, actor: Actor): Promise<RestResponse> {
    // Same gate as `list`, and for the same reason: the metadata of an asset
    // (its storage key above all) is not public just because its bytes may be.
    requireActor(actor)
    const asset = await store.get(id)
    if (asset === null) throw notFound(id)
    return jsonResponse(200, { data: asset })
  }

  async function update(id: string, request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(updateSchema, request.body)
    const asset = await store.update(id, {
      ...(input.alt === undefined ? {} : { alt: input.alt }),
      ...(input.decorative === undefined ? {} : { decorative: input.decorative }),
      ...(input.decorativeJustification === undefined
        ? {}
        : { decorativeJustification: input.decorativeJustification }),
      ...(input.focal === undefined ? {} : { focal: input.focal }),
      ...(input.tags === undefined ? {} : { tags: input.tags }),
    })
    return jsonResponse(200, { data: asset })
  }

  /**
   * `POST /api/media/{id}/replace` (fiche 11 task 4) — overwrites the file
   * behind an id, keeping every reference to it working. Multipart-only:
   * this is never the first upload of something, so the base64 fallback
   * `upload()` keeps for headless clients has no equivalent need here.
   */
  async function replace(id: string, request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const existing = await store.get(id)
    if (existing === null) throw notFound(id)

    if (!isMultipartFormData(request.body)) {
      throw new CogentaError({
        code: 'MEDIA_INVALID',
        message: 'Replacing a file requires a multipart/form-data request.',
        hint: 'Send the new file under a field named "file".',
      })
    }
    const file = request.body.files.find((candidate) => candidate.fieldName === 'file')
    if (file === undefined) {
      throw new CogentaError({
        code: 'MEDIA_INVALID',
        message: 'No file part named "file" was found in the request.',
        hint: 'Send the replacement file under a field named "file".',
      })
    }

    let bytes = Buffer.from(file.data)
    const maxBytes = await effectiveMaxUploadBytes()
    if (bytes.length > maxBytes) throw tooLargeError(maxBytes)

    // A replace keeps the asset's identity, including its `kind` — a photo
    // stays a photo. Swapping a video in over an image id would strand every
    // page that renders it with `ctx.image()`, not `<video>`.
    const declaredKind = mediaKindFromMime(file.mimeType)
    if (declaredKind !== existing.kind) {
      throw new CogentaError({
        code: 'MEDIA_INVALID',
        message: `This asset is a${existing.kind === 'image' ? 'n' : ''} ${existing.kind}; the replacement file is a${declaredKind === 'image' ? 'n' : ''} ${declaredKind}.`,
        hint: 'Replace a file with another of the same kind, or delete and upload a new asset.',
      })
    }

    const mimeType = verifyRealType(existing.kind, bytes) ?? file.mimeType
    const stripGps = parseBooleanField(request.body.fields['stripGps'], true)
    if (
      stripGps &&
      existing.kind === 'image' &&
      sniffImageFormat(bytes) === 'jpeg' &&
      hasGpsData(bytes)
    ) {
      bytes = Buffer.from(stripGpsFromJpeg(bytes))
    }

    // A new storage key, not an overwrite of the old one: `/_image` and
    // `/api/media/{id}/file` are long-cached (L10 task 5's year-long
    // `Cache-Control: immutable`), and `contentHash` — folded into every
    // rendered `<img>` URL as `&v=` — is what actually busts that cache. A
    // key that never changes would let the old bytes keep serving from any
    // cache that already holds them, for up to a year, however hard the
    // database row changed underneath it (the piège this task exists for).
    const contentHash = hashBytes(bytes)
    const storageKey = storageKeyFor(`${id}/${contentHash}`, file.filename)
    await storage.put(storageKey, bytes, { contentType: mimeType })

    const oldStorageKey = existing.storageKey
    const oldVariantNames =
      options.images !== undefined && existing.width !== null && existing.height !== null
        ? options.images.variantNames({ width: existing.width, height: existing.height })
        : []

    let intrinsic: ImageSize | null = null
    const written: string[] = []
    if (options.images !== undefined && existing.kind === 'image') {
      try {
        intrinsic = await options.images.probe(bytes)
        if (intrinsic !== null) {
          for (const variant of await options.images.variants(bytes, intrinsic)) {
            const key = variantKeyFor(id, variant.name)
            await storage.put(key, Buffer.from(variant.bytes), {
              contentType: variant.contentType,
            })
            written.push(key)
          }
        }
      } catch {
        for (const key of written) await storage.delete(key).catch(() => undefined)
        written.length = 0
      }
    }

    const updated = await store.replace(id, {
      mimeType,
      size: bytes.length,
      ...(intrinsic === null ? {} : { width: intrinsic.width, height: intrinsic.height }),
      storageKey,
      contentHash,
    })

    // The old original and its old-size variants are no longer referenced by
    // this asset's row; cleaning them up is what keeps a repeatedly replaced
    // logo from leaking storage forever. Best-effort: an old blob a delete
    // fails to remove is a storage cost, never a correctness problem — the
    // row already points at the new key.
    await storage.delete(oldStorageKey).catch(() => undefined)
    for (const name of oldVariantNames) {
      await storage.delete(variantKeyFor(id, name)).catch(() => undefined)
    }

    return jsonResponse(200, { data: updated })
  }

  /** `GET /api/media/{id}/exif` — read-only, image-only, JPEG-only (fiche 11 task 6). */
  async function exifOf(id: string, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const asset = await store.get(id)
    if (asset === null) throw notFound(id)
    if (asset.kind !== 'image') return jsonResponse(200, { data: null })

    const bytes = await readStorageBytes(storage, asset.storageKey)
    const exif = readExif(bytes)
    return jsonResponse(200, { data: exif })
  }

  /** `GET /api/media/{id}/usage` (fiche 11 task 3). */
  async function usageOf(id: string, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const asset = await store.get(id)
    if (asset === null) throw notFound(id)
    return jsonResponse(200, { data: await scanUsage(id) })
  }

  async function scanUsage(id: string): Promise<MediaUsageReport> {
    if (options.usage === undefined) {
      return { matches: [], scannedEntries: 0, truncated: false }
    }
    return findMediaUsage(id, {
      collections: options.usage.collections,
      storeFor: options.usage.storeFor,
      ...(options.usage.maxEntries === undefined ? {} : { maxEntries: options.usage.maxEntries }),
    })
  }

  /**
   * `POST /api/media/-/bulk-usage` (fiche 05 task 3) — the same bounded scan
   * `usageOf` already runs, once per id, so the bulk-delete confirmation can
   * show what a selection is about to orphan before a single asset is
   * removed. Never blocks the delete itself (R6 asks for reversible and
   * journalled, not locked) — this only makes the usage impossible to miss.
   */
  async function bulkUsage(request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(bulkIdsSchema, request.body)
    const reports: Record<string, MediaUsageReport> = {}
    for (const id of input.ids) {
      reports[id] = await scanUsage(id)
    }
    return jsonResponse(200, { data: reports })
  }

  async function remove(id: string, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const asset = await store.get(id)
    if (asset === null) throw notFound(id)
    await deleteAssetFiles(asset)
    await store.delete(id)
    return jsonResponse(204, null)
  }

  async function deleteAssetFiles(asset: MediaAsset): Promise<void> {
    await storage.delete(asset.storageKey)

    // The renditions go with the original. Their names are recomputed from
    // the recorded size rather than listed, because `StorageDriver` has no
    // `list` — which is exactly why `variantNames` exists and why the ladder
    // is fixed. A variant that was never written deletes as a no-op.
    if (options.images !== undefined && asset.width !== null && asset.height !== null) {
      const names = options.images.variantNames({ width: asset.width, height: asset.height })
      for (const name of names) {
        await storage.delete(variantKeyFor(asset.id, name)).catch(() => undefined)
      }
    }
  }

  /**
   * `POST /api/media/-/bulk-delete` (fiche 11 task 3) — deletes every id it
   * can, reporting the rest. Never a single all-or-nothing transaction: an
   * admin selecting thirty assets should not lose the twenty-nine good
   * deletions because one id was already gone.
   */
  async function bulkDelete(request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(bulkIdsSchema, request.body)

    const deleted: string[] = []
    const failed: { id: string; code: string; message: string }[] = []

    for (const id of input.ids) {
      try {
        const asset = await store.get(id)
        if (asset === null) throw notFound(id)
        await deleteAssetFiles(asset)
        await store.delete(id)
        deleted.push(id)
      } catch (error) {
        failed.push({
          id,
          code: error instanceof CogentaError ? error.code : 'INTERNAL',
          message: error instanceof CogentaError ? error.message : 'Could not delete this asset.',
        })
      }
    }

    return jsonResponse(200, { data: { deleted, failed } })
  }

  /** `POST /api/media/-/bulk-tag` and `.../bulk-untag` (fiche 11 task 5). */
  async function bulkTag(
    request: RestRequest,
    actor: Actor,
    mode: 'add' | 'remove',
  ): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(bulkTagSchema, request.body)

    const updated: MediaAsset[] = []
    const failed: { id: string; code: string; message: string }[] = []

    for (const id of input.ids) {
      try {
        const asset = await store.get(id)
        if (asset === null) throw notFound(id)
        const nextTags =
          mode === 'add'
            ? asset.tags.includes(input.tag)
              ? asset.tags
              : [...asset.tags, input.tag]
            : asset.tags.filter((tag) => tag !== input.tag)
        updated.push(await store.update(id, { tags: nextTags }))
      } catch (error) {
        failed.push({
          id,
          code: error instanceof CogentaError ? error.code : 'INTERNAL',
          message: error instanceof CogentaError ? error.message : 'Could not tag this asset.',
        })
      }
    }

    return jsonResponse(200, { data: { updated, failed } })
  }

  // ---------------------------------------------------------------- folders (fiche 46)

  function folderNotFound(id: string): CogentaError {
    return new CogentaError({
      code: 'MEDIA_FOLDER_NOT_FOUND',
      message: `No media folder with id "${id}".`,
      hint: 'List the folder tree to find a valid id, or the folder may already have been deleted.',
      details: { id },
    })
  }

  /**
   * `GET /api/media/folders` — the whole tree, flattened depth-first,
   * `parentId`/`path` intact for the admin to reconstruct nesting and a
   * breadcrumb client-side. `?parentId=` (empty or `none`) scopes to one
   * level (the roots); omitted returns everything. A media library's folder
   * count is small enough that fetching the whole tree once, rather than
   * paginating it, is the honest simplification here.
   */
  async function listFolders(
    folders: MediaFolderStore,
    request: RestRequest,
    actor: Actor,
  ): Promise<RestResponse> {
    requireActor(actor)
    const parentIdRaw = single(request.query, 'parentId')
    if (parentIdRaw === undefined) {
      return jsonResponse(200, { data: await folders.list() })
    }
    const parentId = parentIdRaw === '' || parentIdRaw === 'none' ? null : parentIdRaw
    return jsonResponse(200, { data: await folders.list({ parentId }) })
  }

  async function createFolder(
    folders: MediaFolderStore,
    request: RestRequest,
    actor: Actor,
  ): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(createFolderSchema, request.body)
    const created = await folders.create({
      name: input.name,
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    })
    return jsonResponse(201, { data: created })
  }

  async function readFolder(
    folders: MediaFolderStore,
    id: string,
    actor: Actor,
  ): Promise<RestResponse> {
    requireActor(actor)
    const found = await folders.read(id)
    if (found === null) throw folderNotFound(id)
    return jsonResponse(200, { data: found })
  }

  /** Renames and/or repositions — never reparents, that is `moveFolder`. */
  async function updateFolder(
    folders: MediaFolderStore,
    id: string,
    request: RestRequest,
    actor: Actor,
  ): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(updateFolderSchema, request.body)
    const updated = await folders.update(id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.position === undefined ? {} : { position: input.position }),
    })
    return jsonResponse(200, { data: updated })
  }

  /** `DELETE /api/media/folders/{id}` — refuses (`MEDIA_FOLDER_NOT_EMPTY`) while subfolders or assets remain, `contents` included: nothing here treats it as more special than any other folder. */
  async function deleteFolder(
    folders: MediaFolderStore,
    id: string,
    actor: Actor,
  ): Promise<RestResponse> {
    requireActor(actor)
    const deleted = await folders.delete(id)
    if (!deleted) throw folderNotFound(id)
    return jsonResponse(204, null)
  }

  async function moveFolder(
    folders: MediaFolderStore,
    id: string,
    request: RestRequest,
    actor: Actor,
  ): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(moveFolderSchema, request.body)
    const moved = await folders.move(id, input.parentId)
    return jsonResponse(200, { data: moved })
  }

  /** Refuses a destination folder that does not exist — skipped entirely when `options.folders` was never wired, the same graceful absence every other folder-aware branch here applies. */
  async function assertFolderExists(folderId: string | null): Promise<void> {
    if (folderId === null || options.folders === undefined) return
    const found = await options.folders.read(folderId)
    if (found === null) throw folderNotFound(folderId)
  }

  /** `POST /api/media/{id}/move` (fiche 46) — files an existing asset in a folder, or clears it back to unclassified with `folderId: null`. */
  async function moveAsset(id: string, request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const asset = await store.get(id)
    if (asset === null) throw notFound(id)
    const input = decode(moveMediaSchema, request.body)
    await assertFolderExists(input.folderId)
    const moved = await store.update(id, { folderId: input.folderId })
    return jsonResponse(200, { data: moved })
  }

  /**
   * `POST /api/media/-/bulk-move` (fiche 46) — same named-failure-report
   * shape as `bulkDelete`/`bulkTag`. Unlike those, the destination is
   * validated once before the loop rather than per id: every asset in one
   * bulk move shares the same target, so a missing folder is one failure to
   * report, not the same failure repeated once per selected asset.
   */
  async function bulkMove(request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(bulkMoveSchema, request.body)
    await assertFolderExists(input.folderId)

    const moved: MediaAsset[] = []
    const failed: { id: string; code: string; message: string }[] = []

    for (const id of input.ids) {
      try {
        const asset = await store.get(id)
        if (asset === null) throw notFound(id)
        moved.push(await store.update(id, { folderId: input.folderId }))
      } catch (error) {
        failed.push({
          id,
          code: error instanceof CogentaError ? error.code : 'INTERNAL',
          message: error instanceof CogentaError ? error.message : 'Could not move this asset.',
        })
      }
    }

    return jsonResponse(200, { data: { moved, failed } })
  }
}

/** Reads a `StorageDriver` object fully into memory — only ever for a single already-uploaded original, never a public path. */
async function readStorageBytes(storage: StorageDriver, key: string): Promise<Buffer> {
  const stream = await storage.get(key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

function parseDateBound(parameter: 'from' | 'to', raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (Number.isNaN(Date.parse(raw))) {
    throw queryError(parameter, 'is not a usable date', 'Pass an ISO 8601 date or date-time.')
  }
  return raw
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MEDIA_NOT_FOUND',
    message: `No media asset with id "${id}".`,
    hint: 'List media to find a valid id, or the asset may already have been deleted.',
    details: { id },
  })
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'MEDIA_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Media routes are /api/media, /api/media/{id} and a handful of sub-resources — see the router source.',
  })
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null

  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}
