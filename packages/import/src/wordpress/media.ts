import { lookup } from 'node:dns/promises'
import { basename } from 'node:path'
import {
  type CreateMediaInput,
  isCogentaError,
  type MediaAsset,
  type MediaStore,
  readBoundedBody,
  type StorageDriver,
  sniffImageFormat,
} from '@cogenta/core'
import { createPinnedFetch, type PinnedFetch, resolvePublicTarget } from '../ssrf.js'

export interface MediaDownloadFailure {
  readonly url: string
  readonly reason: string
}

export interface MediaImportResult {
  readonly urlToMediaId: ReadonlyMap<string, string>
  readonly imported: readonly MediaAsset[]
  readonly failed: readonly MediaDownloadFailure[]
}

/**
 * Caps on the outbound side of an import (pièges connus: SSRF, and a
 * multi-gigabyte "media" response tying up the process). Both are limits a
 * real WordPress export can comfortably stay under; a file or count beyond
 * them is reported as a failure per item, never a reason to abort the run.
 */
const MAX_MEDIA_BYTES = 50 * 1024 * 1024
const MAX_MEDIA_ITEMS = 5000
const FETCH_TIMEOUT_MS = 15_000

export interface DownloadAndStoreMediaOptions {
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  readonly createdBy: string | null
  /**
   * Injected for tests — by default requests go through the address-pinned
   * transport. A `fetchImpl` here is called with the validated URL and gets
   * no pinning of its own.
   */
  readonly fetchImpl?: typeof fetch
  /** Injected for tests — replaces the address-pinned transport. Takes precedence over `fetchImpl`. */
  readonly pinnedFetchImpl?: PinnedFetch
  /** Injected for tests — real `dns.lookup` by default. */
  readonly lookupImpl?: typeof lookup
  /** Time allowed per file, headers and body together. Defaults to 15 seconds. */
  readonly fetchTimeoutMs?: number
}

function filenameFrom(url: string): string {
  try {
    const path = new URL(url).pathname
    const name = basename(path)
    return name.length > 0 ? name : 'file'
  } catch {
    return 'file'
  }
}

/** Redirects followed per media URL, each hop checked like the first. */
const MAX_REDIRECTS = 5

/**
 * The response for `url`, following redirects by hand: `fetch` follows
 * them itself and checks nothing, so a public host answering
 * `302 → http://169.254.169.254/…` made the import fetch the cloud
 * metadata and store it as a media file (security review of 2026-10-21).
 * Every hop is checked as a public address before it is requested.
 */
async function fetchPublic(
  url: string,
  fetchPinned: PinnedFetch,
  lookupImpl: typeof lookup,
  signal: AbortSignal,
): Promise<Response> {
  let current = url
  for (let hop = 0; ; hop++) {
    // Resolved and judged once; the connection below is made to this very
    // address, so a DNS answer that changes in between changes nothing.
    const target = await resolvePublicTarget(current, { lookupImpl })
    const response = await fetchPinned(target, { signal })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || location === null) return response
    // The redirect response has no use for its body.
    void response.body?.cancel().catch(() => undefined)
    if (hop >= MAX_REDIRECTS) throw new Error(`More than ${MAX_REDIRECTS} redirects.`)
    current = new URL(location, current).toString()
  }
}

/** Formats whose type is read from the bytes, never taken from the remote server. */
const SAFE_DECLARED_TYPES = new Set([
  'application/pdf',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
])

/**
 * The type a downloaded file is stored as. An image is named by its bytes;
 * a handful of plainly inert formats keep the type the server declared;
 * anything else — `text/html`, `image/svg+xml` — is stored as an opaque
 * download, so a hostile host cannot plant a page on this site's origin.
 */
function storedTypeOf(declared: string, bytes: Uint8Array): string {
  const image = sniffImageFormat(bytes)
  if (image !== null) return `image/${image}`
  if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'GIF8')
    return 'image/gif'
  return SAFE_DECLARED_TYPES.has(declared) ? declared : 'application/octet-stream'
}

function kindFor(mimeType: string): CreateMediaInput['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
}

function failureReason(error: unknown, signal: AbortSignal, timeoutMs: number): string {
  if (signal.aborted) return `Timed out after ${timeoutMs}ms.`
  if (isCogentaError(error) && error.code === 'HTTP_BODY_TOO_LARGE') {
    return `Larger than the ${MAX_MEDIA_BYTES} byte limit.`
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Downloads every distinct media URL a WXR import references and stores it
 * for real (rule: no mocking the storage layer — the fetch boundary is the
 * only thing tests stand in for). A URL that fails to fetch is named in
 * `failed`, never thrown: one dead upstream image, common in a real-world
 * export, must not abort the whole import (the lot's own framing: a reported
 * partial loss is the acceptable outcome, a silent one is not).
 */
export async function downloadAndStoreMedia(
  urls: readonly string[],
  options: DownloadAndStoreMediaOptions,
): Promise<MediaImportResult> {
  const fetchPinned: PinnedFetch =
    options.pinnedFetchImpl ??
    (options.fetchImpl === undefined
      ? createPinnedFetch()
      : (target, init) =>
          (options.fetchImpl as typeof fetch)(target.url.toString(), {
            signal: init.signal ?? null,
            redirect: 'manual',
          }))
  const urlToMediaId = new Map<string, string>()
  const imported: MediaAsset[] = []
  const failed: MediaDownloadFailure[] = []

  const distinct = [...new Set(urls)]
  const overflow = distinct.slice(MAX_MEDIA_ITEMS)
  for (const url of overflow) {
    failed.push({
      url,
      reason: `More than ${MAX_MEDIA_ITEMS} distinct media URLs; this one was not fetched.`,
    })
  }

  for (const url of distinct.slice(0, MAX_MEDIA_ITEMS)) {
    // One deadline for the whole file — the redirects, the headers and the
    // body. It used to be cleared when the headers arrived, which left a
    // server free to send the body at a byte a minute.
    const controller = new AbortController()
    const timeoutMs = options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchPublic(
        url,
        fetchPinned,
        options.lookupImpl ?? lookup,
        controller.signal,
      )
      if (!response.ok) {
        failed.push({ url, reason: `HTTP ${response.status}` })
        continue
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '')
      if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
        failed.push({ url, reason: `Larger than the ${MAX_MEDIA_BYTES} byte limit.` })
        continue
      }

      const declaredType =
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ??
        'application/octet-stream'
      // The header is the remote end's word; the limit is enforced on the
      // bytes that actually arrive, and the transfer is cancelled there.
      const { bytes } = await readBoundedBody(response, {
        maxBytes: MAX_MEDIA_BYTES,
        onLimit: 'throw',
        signal: controller.signal,
      })
      const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const mimeType = storedTypeOf(declaredType, buffer)
      const filename = filenameFrom(url)
      const storageKey = `imports/wordpress/${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`

      await options.storage.put(storageKey, buffer, { contentType: mimeType })

      const asset = await options.mediaStore.create({
        kind: kindFor(mimeType),
        filename,
        mimeType,
        size: buffer.byteLength,
        // WXR carries no alt text for attachments; a synthesised value keeps
        // the media library's own alt-text requirement honest rather than
        // inventing a description of an image nobody described, and the gap
        // is named in the conversion report so an editor knows to revisit it.
        alt: `Imported from WordPress: ${filename}`,
        storageKey,
        createdBy: options.createdBy,
      })

      urlToMediaId.set(url, asset.id)
      imported.push(asset)
    } catch (error) {
      failed.push({ url, reason: failureReason(error, controller.signal, timeoutMs) })
    } finally {
      clearTimeout(timeout)
    }
  }

  return { urlToMediaId, imported, failed }
}
