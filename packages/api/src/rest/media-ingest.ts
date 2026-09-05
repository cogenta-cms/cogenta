import { createHash, randomUUID } from 'node:crypto'
import {
  CogentaError,
  describeContainer,
  type FocalPoint,
  hasGpsData,
  type MediaAsset,
  type MediaKind,
  type MediaStore,
  type StorageDriver,
  sniffImageFormat,
  stripGpsFromJpeg,
} from '@cogenta/core'

/**
 * The core of a media upload — sniff the real type, scrub GPS, write the
 * original, derive variants, create the asset row — pulled out of
 * `media-router.ts`'s `upload()` handler (L25 task A0b) so `create-cogenta`
 * can seed real media through the exact same pipeline a human upload takes,
 * rather than a second, drifting implementation of it.
 *
 * `media-router.ts`'s `finishUpload` is now a thin adapter: it decodes the
 * two upload transports (multipart / legacy base64 JSON) into
 * {@link IngestMediaUploadInput}, calls this function, and wraps the result
 * in an HTTP response. Every behaviour this module documents — real-type
 * verification, GPS scrub order, best-effort cleanup on a partial failure —
 * is unchanged from before this extraction; the router's own test suite is
 * the proof (it stays green, unedited).
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
 * the `srcset` ladder) and this package must not depend on it — see this
 * type's original doc comment in `media-router.ts` for the full reasoning.
 * Absent means "no image processing": uploads still work, they simply carry
 * no dimensions and no variants (R2's shape, applied to images).
 */
export interface MediaImageProcessor {
  /** Intrinsic size, or null when the bytes cannot be read as an image. */
  probe(bytes: Uint8Array): Promise<ImageSize | null>
  /** The renditions to store beside the original, for an image of this size. */
  variants(bytes: Uint8Array, intrinsic: ImageSize): Promise<readonly UploadedImageVariant[]>
  /** The names `variants()` would produce for this size — see `media-router.ts`'s copy of this doc for why it exists. */
  variantNames(intrinsic: ImageSize): readonly string[]
}

export interface IngestMediaUploadDeps {
  readonly store: MediaStore
  readonly storage: StorageDriver
  /** Absent: uploads work, carry no dimensions and no variants. */
  readonly images?: MediaImageProcessor
  /** Absent: `DEFAULT_MAX_UPLOAD_BYTES` applies. */
  readonly limits?: { readonly maxUploadBytes?: number }
}

export interface IngestMediaUploadInput {
  readonly kind: MediaKind
  readonly filename: string
  readonly mimeType: string
  readonly bytes: Uint8Array
  /** The actor this upload is attributed to — `MediaAsset.createdBy`. `null` for a system seed with no signed-in human behind it. */
  readonly actorId: string | null
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string
  readonly focal?: FocalPoint
  readonly tags?: readonly string[]
  readonly folderId?: string | null
  /** Strips EXIF GPS coordinates from a JPEG original. Defaults to `true`, matching the router. */
  readonly stripGps?: boolean
}

/**
 * The default cap on a *decoded* upload — mirrors `media-router.ts`'s own
 * constant of the same name and value; duplicated rather than imported
 * because this is the lower layer the router now builds on, not the other
 * way round.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 250 * 1024 * 1024

/** Letters, digits, dot, dash, underscore — the same whitelist `StorageDriver` keys require. */
function sanitiseFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/gu, '-')
  return cleaned.length === 0 ? 'file' : cleaned
}

function storageKeyFor(id: string, filename: string): string {
  return `media/${id}/${sanitiseFilename(filename)}`
}

/**
 * Where a derived rendition lives — see `media-router.ts`'s own doc comment
 * for the full reasoning. Re-exported by `media-router.ts` so `@cogenta/api`'s
 * public export of this name is unchanged.
 */
export function variantKeyFor(id: string, name: string): string {
  return `media/${id}/variants/${sanitiseFilename(name)}`
}

/** A short, stable digest of the bytes actually stored. */
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

const CONTENT_TYPE_BY_FORMAT: Readonly<Record<string, string>> = Object.freeze({
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
})

/**
 * Checks an image is really an image, and answers with the content type its
 * bytes earn. `null` for every other kind, which is stored as declared.
 */
function verifyRealType(kind: MediaKind, bytes: Uint8Array): string | null {
  if (kind !== 'image') return null

  const format = sniffImageFormat(bytes)
  if (format !== null) return CONTENT_TYPE_BY_FORMAT[format] ?? 'application/octet-stream'

  throw new CogentaError({
    code: 'MEDIA_TYPE_REJECTED',
    message: `This file is ${describeContainer(bytes)}, not a supported image.`,
    hint: 'Upload AVIF, WebP, JPEG or PNG. SVGs are refused by default (ADR-0017) until a reviewed sanitizer exists.',
  })
}

/**
 * Ingests one file through the real media pipeline: verify its real type,
 * scrub GPS from a JPEG, write the original, derive variants when an image
 * processor is given, create the asset row — cleaning up any bytes already
 * written if the row itself is refused, so a failed ingest never leaves an
 * orphaned blob.
 *
 * Used by two callers: `media-router.ts`'s `POST /api/media` (a human
 * upload, behaviour byte-for-byte unchanged by this extraction) and
 * `create-cogenta`'s `seedDemoMedia` (a blueprint's procedurally generated
 * art, going through the exact same checks and variant pipeline a real
 * upload would).
 */
export async function ingestMediaUpload(
  deps: IngestMediaUploadDeps,
  input: IngestMediaUploadInput,
): Promise<MediaAsset> {
  const maxBytes = deps.limits?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  if (input.bytes.length > maxBytes) throw tooLargeError(maxBytes)

  // For an image this is the type the *bytes* say, not the one the caller
  // declared — the asset record and every response built from it use it.
  const mimeType = verifyRealType(input.kind, input.bytes) ?? input.mimeType

  let bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes)
  const stripGps = input.stripGps ?? true
  if (
    stripGps &&
    input.kind === 'image' &&
    sniffImageFormat(bytes) === 'jpeg' &&
    hasGpsData(bytes)
  ) {
    bytes = Buffer.from(stripGpsFromJpeg(bytes))
  }

  const id = randomUUID()
  const storageKey = storageKeyFor(id, input.filename)
  await deps.storage.put(storageKey, bytes, { contentType: mimeType })

  // Dimensions and renditions, once, at ingest — a failure here must not
  // lose the upload: the original is already stored, so a missing variant
  // degrades to "served at full size", never to "ingest refused".
  const written: string[] = []
  let intrinsic: ImageSize | null = null
  if (deps.images !== undefined && input.kind === 'image') {
    try {
      intrinsic = await deps.images.probe(bytes)
      if (intrinsic !== null) {
        for (const variant of await deps.images.variants(bytes, intrinsic)) {
          const key = variantKeyFor(id, variant.name)
          await deps.storage.put(key, Buffer.from(variant.bytes), {
            contentType: variant.contentType,
          })
          written.push(key)
        }
      }
    } catch {
      for (const key of written) await deps.storage.delete(key).catch(() => undefined)
      written.length = 0
    }
  }

  try {
    return await deps.store.create({
      id,
      kind: input.kind,
      filename: input.filename,
      mimeType,
      size: bytes.length,
      ...(intrinsic === null ? {} : { width: intrinsic.width, height: intrinsic.height }),
      alt: input.alt ?? '',
      decorative: input.decorative ?? false,
      ...(input.decorativeJustification === undefined
        ? {}
        : { decorativeJustification: input.decorativeJustification }),
      ...(input.focal === undefined ? {} : { focal: input.focal }),
      storageKey,
      tags: input.tags ?? [],
      contentHash: hashBytes(bytes),
      createdBy: input.actorId,
      ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
    })
  } catch (error) {
    // The asset row is what makes the ingest real; if it is refused, the
    // blob (and any variants) must not become an orphan nothing lists or
    // cleans up.
    await deps.storage.delete(storageKey).catch(() => undefined)
    for (const key of written) await deps.storage.delete(key).catch(() => undefined)
    throw error
  }
}
