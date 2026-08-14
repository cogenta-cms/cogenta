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

export interface MediaRouterOptions {
  readonly store: MediaStore
  readonly storage: StorageDriver
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

function decodeBase64(data: string): Buffer {
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
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: `The file is larger than the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB this route accepts.`,
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
function verifyRealType(kind: MediaKind, bytes: Buffer): void {
  if (kind !== 'image') return

  const format = sniffImageFormat(bytes)
  if (format !== null) return

  throw new CogentaError({
    code: 'MEDIA_TYPE_REJECTED',
    message: `This file is ${describeContainer(bytes)}, not a supported image.`,
    hint: 'Upload AVIF, WebP, JPEG or PNG. SVGs are refused by default (ADR-0017) until a reviewed sanitizer exists.',
  })
}

function storageKeyFor(id: string, filename: string): string {
  return `media/${id}/${sanitiseFilename(filename)}`
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
      if (method === 'GET') return list(request)
      if (method === 'POST') return upload(request, actor)
      return methodNotAllowed(['GET', 'POST'])
    }

    if (method === 'GET') return read(id)
    if (method === 'PATCH' || method === 'PUT') return update(id, request, actor)
    if (method === 'DELETE') return remove(id, actor)
    return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
  }

  async function list(request: RestRequest): Promise<RestResponse> {
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
    const bytes = decodeBase64(input.data)
    verifyRealType(input.kind, bytes)

    const id = randomUUID()
    const storageKey = storageKeyFor(id, input.filename)

    await storage.put(storageKey, bytes, { contentType: input.mimeType })

    let asset: MediaAsset
    try {
      asset = await store.create({
        id,
        kind: input.kind,
        filename: input.filename,
        mimeType: input.mimeType,
        size: bytes.length,
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
      // an orphan nothing ever lists or cleans up.
      await storage.delete(storageKey).catch(() => undefined)
      throw error
    }

    return jsonResponse(201, { data: asset })
  }

  async function read(id: string): Promise<RestResponse> {
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
