import { randomUUID } from 'node:crypto'
import {
  CogentaError,
  describeContainer,
  MEDIA_KINDS,
  type MediaAsset,
  type MediaKind,
  type MediaStore,
  type StorageDriver,
  sniffImageFormat,
} from '@cogenta/core'
import { z } from 'zod'
import type { Actor } from '../types.js'
import {
  errorResponse,
  jsonResponse,
  queryError,
  type RestRequest,
  type RestResponse,
} from './http.js'
import { single } from './query.js'

/**
 * `/api/media` — upload, list, read, edit and delete media assets.
 *
 * Every route here requires an authenticated actor (`actor.id !== null`):
 * there is no per-collection permission model for media the way there is for
 * content, so the only gate today is "signed in at all" — a known gap,
 * tightened once L4's agent tool permissions land (contract C already names
 * `media.read`/`media.write` scopes for that).
 *
 * Uploads travel as JSON with the file base64-encoded, not multipart: the
 * REST transport's own contract is "a request in, a body already parsed by
 * the transport" (`http.ts`), and staying inside that contract avoids a
 * multipart parser (a new dependency, R9) and a change to how every other
 * route's body reaches this layer, at the cost of ~33% more bytes on the
 * wire — an acceptable trade for an admin-only upload path.
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

export interface MediaRouterOptions {
  readonly store: MediaStore
  readonly storage: StorageDriver
  /**
   * Generates resized/re-encoded variants at upload time (L10 task 5).
   *
   * Absent by default: the pipeline is optional, and an install without it
   * uploads and serves originals exactly as before.
   */
  readonly images?: MediaImageProcessor
  /**
   * The upload size ceiling, in bytes (fiche 23 task 2 — the "Médias" tab's
   * `media.maxUploadSizeMb` setting). A function, not a plain number: it is
   * backed by a database row that can change without a redeploy, so this is
   * read fresh on every upload rather than baked in when the router is
   * constructed. Absent means `MAX_UPLOAD_BYTES` — the pre-fiche-23 fixed
   * 15MB ceiling, unchanged.
   */
  readonly maxUploadBytes?: () => Promise<number>
  /** Mount point. `/api/media` by default. */
  readonly basePath?: string
}

export interface MediaRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/media'

// Base64 costs ~33% more bytes than the original, so this bounds the decoded
// size to roughly 15MB — generous for a web image, small enough that a
// request body is never the resource exhaustion vector.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

// How many of the most recent assets `q` scans in memory. `MediaStore.list`
// has no substring filter of its own; this bounds the cost of one without a
// migration, at the price of never finding an old asset outside this window.
const MEDIA_SEARCH_SCAN_LIMIT = 200

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
})

const updateSchema = z.object({
  alt: z.string().max(2000).optional(),
  decorative: z.boolean().optional(),
  decorativeJustification: z.string().max(2000).nullable().optional(),
  focal: focalSchema.nullable().optional(),
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
  if (buffer.length > maxBytes) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: `The file is larger than the ${Math.floor(maxBytes / (1024 * 1024))}MB this route accepts.`,
      hint: 'Upload a smaller file.',
    })
  }
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

export function createMediaRouter(options: MediaRouterOptions): MediaRouter {
  const { store, storage } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

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
    if (segments === null || segments.length > 1) throw noRoute()

    const method = request.method.toUpperCase()
    const [id] = segments

    if (id === undefined) {
      if (method === 'GET') return list(request, actor)
      if (method === 'POST') return upload(request, actor)
      return methodNotAllowed(['GET', 'POST'])
    }

    if (method === 'GET') return read(id, actor)
    if (method === 'PATCH' || method === 'PUT') return update(id, request, actor)
    if (method === 'DELETE') return remove(id, actor)
    return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
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

    // No dedicated index for media: `q` is a substring match on filename and
    // alt text, applied in memory over a bounded scan from the store. Good
    // enough for the volume an admin media library holds today (the header
    // search this route feeds); a real index is `@cogenta/schema`'s search
    // engine, built for content, not for a handful of asset fields.
    if (q !== undefined && q.trim().length > 0) {
      const needle = q.trim().toLowerCase()
      const scanned = await store.list({
        ...(kind === undefined ? {} : { kind: kind as MediaKind }),
        limit: MEDIA_SEARCH_SCAN_LIMIT,
      })
      const matches = scanned.items.filter(
        (asset) =>
          asset.filename.toLowerCase().includes(needle) || asset.alt.toLowerCase().includes(needle),
      )
      const pageSize = limit ?? matches.length
      return jsonResponse(200, {
        data: matches.slice(0, pageSize),
        page: { hasMore: false, nextCursor: null },
      })
    }

    const page = await store.list({
      ...(kind === undefined ? {} : { kind: kind as MediaKind }),
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    })
    return jsonResponse(200, {
      data: page.items,
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    })
  }

  async function upload(request: RestRequest, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const input = decode(uploadSchema, request.body)
    const maxBytes =
      options.maxUploadBytes === undefined ? MAX_UPLOAD_BYTES : await options.maxUploadBytes()
    const bytes = decodeBase64(input.data, maxBytes)
    // For an image this is the type the *bytes* say, not the one the uploader
    // typed — the asset record and every response built from it use it, so a
    // disguised type cannot travel back out as a `Content-Type`.
    const mimeType = verifyRealType(input.kind, bytes) ?? input.mimeType

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
        alt: input.alt ?? '',
        ...(input.decorative === undefined ? {} : { decorative: input.decorative }),
        ...(input.decorativeJustification === undefined
          ? {}
          : { decorativeJustification: input.decorativeJustification }),
        ...(input.focal === undefined ? {} : { focal: input.focal }),
        storageKey,
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
    })
    return jsonResponse(200, { data: asset })
  }

  async function remove(id: string, actor: Actor): Promise<RestResponse> {
    requireActor(actor)
    const asset = await store.get(id)
    if (asset === null) throw notFound(id)
    await storage.delete(asset.storageKey)

    // The renditions go with the original. Their names are recomputed from
    // the recorded size rather than listed, because `StorageDriver` has no
    // `list` — which is exactly why `variantNames` exists and why the ladder
    // is fixed. A variant that was never written deletes as a no-op.
    if (options.images !== undefined && asset.width !== null && asset.height !== null) {
      const names = options.images.variantNames({ width: asset.width, height: asset.height })
      for (const name of names) {
        await storage.delete(variantKeyFor(id, name)).catch(() => undefined)
      }
    }

    await store.delete(id)
    return jsonResponse(204, null)
  }
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
    hint: 'Media routes are /api/media and /api/media/{id}.',
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
