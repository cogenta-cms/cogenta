import { lookup } from 'node:dns/promises'
import { basename } from 'node:path'
import type { CreateMediaInput, MediaAsset, MediaStore, StorageDriver } from '@cogenta/core'
import { assertPublicUrl } from '../ssrf.js'

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
  /** Injected for tests — real `fetch` by default. */
  readonly fetchImpl?: typeof fetch
  /** Injected for tests — real `dns.lookup` by default. */
  readonly lookupImpl?: typeof lookup
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

function kindFor(mimeType: string): CreateMediaInput['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
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
  const doFetch = options.fetchImpl ?? fetch
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
    try {
      await assertPublicUrl(url, { lookupImpl: options.lookupImpl ?? lookup })

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let response: Response
      try {
        response = await doFetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }
      if (!response.ok) {
        failed.push({ url, reason: `HTTP ${response.status}` })
        continue
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '')
      if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
        failed.push({ url, reason: `Larger than the ${MAX_MEDIA_BYTES} byte limit.` })
        continue
      }

      const mimeType =
        response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream'
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > MAX_MEDIA_BYTES) {
        failed.push({ url, reason: `Larger than the ${MAX_MEDIA_BYTES} byte limit.` })
        continue
      }
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
      failed.push({ url, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  return { urlToMediaId, imported, failed }
}
