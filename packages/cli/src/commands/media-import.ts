import { ingestMediaUpload, type MediaImageProcessor, removeMediaAsset } from '@cogenta/api'
import {
  CogentaError,
  type FetchPublicOptions,
  fetchPublicOnce,
  isCogentaError,
  type MediaStore,
  type PinnedFetch,
  readBoundedBody,
  type StorageDriver,
} from '@cogenta/core'
import { type CollectionDefinition, type ContentStore, findMediaUsage } from '@cogenta/schema'

/**
 * The host side of `media.import_url`: fetch one image from a public https
 * address and put it through the media ingest a human upload goes through.
 *
 * Two existing pieces do the real work, on purpose:
 *
 * - `fetchPublicOnce` (`@cogenta/core`) resolves the host, refuses a
 *   loopback, private or link-local address and connects to the address it
 *   checked. It never follows a redirect, so each hop is judged here on its
 *   own, and a redirect may not leave https.
 * - `ingestMediaUpload` (`@cogenta/api`) sniffs the real type from the
 *   bytes (a page or a script served as `image/png` is refused), strips GPS
 *   from a JPEG, writes the original and its renditions, creates the row.
 *
 * What this module adds is only what a remote file needs and an upload does
 * not: a size cap read off the stream, a deadline, a hop limit, and the
 * source address and credit kept with the file.
 */

/** Most bytes one imported image may weigh — a 1920 px photograph is a few hundred KB. */
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 20_000

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

export interface UrlImageImporterOptions {
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  /** The processor `POST /api/media` uses, so an import gets dimensions and renditions too. */
  readonly images?: MediaImageProcessor
  /** Test seams only — production leaves both out and gets the real resolver and pinned transport. */
  readonly lookupImpl?: FetchPublicOptions['lookupImpl']
  readonly pinnedFetch?: PinnedFetch
}

export interface UrlImageImportInput {
  readonly url: string
  readonly alt: string
  readonly filename?: string
  readonly credit?: {
    readonly author?: string
    readonly license?: string
    readonly sourcePage?: string
  }
  readonly actorId: string | null
  /** Who asked for the import, kept in the file's provenance. */
  readonly agent?: string
}

export interface UrlImageImportResult {
  readonly id: string
  readonly filename: string
  readonly mimeType: string
  readonly byteLength: number
  readonly width: number | null
  readonly height: number | null
}

function failed(message: string, hint: string, details?: Readonly<Record<string, unknown>>) {
  return new CogentaError({
    code: 'MEDIA_IMPORT_FAILED',
    message,
    hint,
    ...(details === undefined ? {} : { details }),
  })
}

/** The address without credentials, query or fragment — a signed URL's token is never kept. */
function sourceOf(url: URL): string {
  return `${url.origin}${url.pathname}`
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The last path segment without its extension, reduced to safe characters. */
function stemOf(url: URL, preferred: string | undefined): string {
  const raw = preferred ?? decodeSegment(url.pathname.split('/').filter(Boolean).pop() ?? 'image')
  const stem = raw
    .replace(/\.[a-z0-9]{2,5}$/iu, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
  return stem.length > 0 ? stem : 'image'
}

export function createUrlImageImporter(
  options: UrlImageImporterOptions,
): (input: UrlImageImportInput) => Promise<UrlImageImportResult> {
  return async (input) => {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    let current = new URL(input.url)
    let response: Response | undefined
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (current.protocol !== 'https:') {
        throw failed(
          `Only https addresses are imported; this one is "${current.protocol}".`,
          'Use the https address of the image file.',
        )
      }
      try {
        response = await fetchPublicOnce(current.href, {
          signal,
          ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
          ...(options.pinnedFetch === undefined ? {} : { pinnedFetch: options.pinnedFetch }),
        })
      } catch (error) {
        if (isCogentaError(error)) throw error
        throw failed(`Could not reach ${current.host}.`, 'Check the address, or try again later.', {
          host: current.host,
        })
      }
      if (response.status < 300 || response.status >= 400) break
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (location === null) break
      try {
        current = new URL(location, current)
      } catch {
        throw failed(
          `${current.host} redirected to an invalid address.`,
          'Use the final address of the image file.',
        )
      }
      response = undefined
    }
    if (response === undefined) {
      throw failed(
        `More than ${MAX_REDIRECTS} redirects from ${input.url}.`,
        'Use the final address of the image file.',
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw failed(
        `${current.host} answered ${response.status} for this image.`,
        'Check the address points at the file itself and is publicly reachable.',
        { status: response.status },
      )
    }
    const declared = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      ?.trim()
      .toLowerCase()
    if (declared === undefined || EXTENSION_BY_TYPE[declared] === undefined) {
      await response.body?.cancel()
      throw new CogentaError({
        code: 'MEDIA_TYPE_REJECTED',
        message: `The address serves "${declared || 'no content type'}", not a supported image.`,
        hint: `Point at the image file itself (${Object.keys(EXTENSION_BY_TYPE).join(', ')}), not at a page that shows it.`,
      })
    }
    const body = await readBoundedBody(response, {
      maxBytes: MAX_IMPORT_BYTES,
      onLimit: 'throw',
      timeoutMs: TIMEOUT_MS,
      signal,
    })

    const asset = await ingestMediaUpload(
      {
        store: options.mediaStore,
        storage: options.storage,
        ...(options.images === undefined ? {} : { images: options.images }),
      },
      {
        kind: 'image',
        filename: `${stemOf(current, input.filename)}.${EXTENSION_BY_TYPE[declared]}`,
        mimeType: declared,
        bytes: body.bytes,
        actorId: input.actorId,
        alt: input.alt,
        // Chosen by an AI client, made by someone else: never `human`.
        provenance: 'assisted',
        provenanceDetail: {
          importedFrom: sourceOf(new URL(input.url)),
          ...(input.agent === undefined ? {} : { agent: input.agent }),
          at: new Date().toISOString(),
          ...(input.credit?.author === undefined ? {} : { author: input.credit.author }),
          ...(input.credit?.license === undefined ? {} : { license: input.credit.license }),
          ...(input.credit?.sourcePage === undefined
            ? {}
            : { sourcePage: input.credit.sourcePage }),
        },
      },
    )
    return {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      byteLength: asset.size,
      width: asset.width,
      height: asset.height,
    }
  }
}

export interface UrlImageRemoverOptions {
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  readonly images?: MediaImageProcessor
  /** The site's content, scanned for references before anything is deleted. */
  readonly collections: readonly CollectionDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
}

/**
 * The host side of undoing `media.import_url`: delete the imported file, but
 * only if the site's content no longer references it. A deleted file cannot
 * come back, so unlike the trash this undo is guarded, not merely reported.
 *
 * "References" means: the working *and* the published face of every entry,
 * the trash included (a restored entry would otherwise point at nothing),
 * and a scan that could not cover everything counts as "in use". Not
 * scanned: references from outside content (site settings such as a logo,
 * menus, a user's avatar) — a file nobody asked to keep, imported moments
 * ago, is unlikely to be there, and the plain delete route does not look at
 * all. Only an asset that records where it was imported from is accepted, so
 * this undo cannot be aimed at a file a person uploaded.
 */
export function createUrlImageRemover(
  options: UrlImageRemoverOptions,
): (input: { readonly id: string }) => Promise<void> {
  const everything = (
    collection: CollectionDefinition,
    state: 'working' | 'published',
  ): ContentStore => {
    const store = options.storeFor(collection)
    return {
      ...store,
      list: (listOptions = {}) => store.list({ ...listOptions, state, trashed: 'include' }),
    }
  }
  return async ({ id }) => {
    const asset = await options.mediaStore.get(id)
    // Already gone: the state this undo aims for.
    if (asset === null) return
    if (typeof asset.provenanceDetail?.['importedFrom'] !== 'string') {
      throw new CogentaError({
        code: 'TOOL_REVERT_REFUSED',
        message: `"${asset.filename}" was not imported from an address, so this undo does not delete it.`,
        hint: 'Delete it from the media library if it is really unwanted.',
        details: { id },
      })
    }
    for (const state of ['working', 'published'] as const) {
      const usage = await findMediaUsage(id, {
        collections: options.collections,
        storeFor: (collection) => everything(collection, state),
      })
      if (usage.matches.length > 0 || usage.truncated) {
        throw new CogentaError({
          code: 'TOOL_REVERT_REFUSED',
          message: usage.truncated
            ? `"${asset.filename}" could not be checked against all the content, so it was not deleted.`
            : `"${asset.filename}" is used by ${usage.matches.length} place(s) in the content; it was not deleted.`,
          hint: 'Remove it from those entries first, or keep the file.',
          details: { id, uses: usage.matches.length },
        })
      }
    }
    await removeMediaAsset(
      {
        store: options.mediaStore,
        storage: options.storage,
        ...(options.images === undefined ? {} : { images: options.images }),
      },
      id,
    )
  }
}
