import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { CogentaError, type StorageDriver } from '@cogenta/core'
import { type EmbedPreviewRecord, type EmbedPreviewStore, embedPreviewHash } from '@cogenta/schema'
import {
  closestEmbedRatio,
  detectEmbedProvider,
  type EmbedProvider,
  isResolvableProvider,
  resolveEmbed,
} from './oembed.js'

/**
 * The embed preview cache in use (L38): resolve an address once, keep what
 * its provider says and a copy of its thumbnail, and hand both back without
 * the network. Shared by the admin route (an editor pastes an address) and
 * the host (a page holds an address nothing resolved yet).
 */

export interface EmbedPreviewView {
  readonly url: string
  readonly provider: EmbedProvider
  /** `unsupported`: a provider without a fixed endpoint — detected, never fetched. */
  readonly status: 'ok' | 'failed' | 'unsupported'
  readonly title: string | null
  readonly authorName: string | null
  /** Contract B's closest `ratio`, when the provider gave proportions close to one. */
  readonly ratio: string | null
  /** Served by the site itself, never the provider's address. */
  readonly thumbnailPath: string | null
  readonly thumbnailWidth: number | null
  readonly thumbnailHeight: number | null
}

export interface EmbedPreviewServiceOptions {
  readonly store: EmbedPreviewStore
  readonly storage: StorageDriver
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>
  readonly now?: () => Date
  /** Where a thumbnail is served. `/_cogenta/embeds` by default. */
  readonly thumbnailBasePath?: string
  /** How long a resolved preview is trusted. 30 days by default. */
  readonly freshForMs?: number
  /** How long a failure is remembered before asking again. One day by default. */
  readonly retryFailedAfterMs?: number
}

export interface EmbedPreviewService {
  /** Resolves `url` unless a fresh record exists. Throws `EMBED_URL_INVALID` for a non-HTTP(S) address. */
  resolve(url: string): Promise<EmbedPreviewView>
  /** What the cache already knows, without the network. */
  cached(urls: readonly string[]): Promise<ReadonlyMap<string, EmbedPreviewView>>
  /** Whether `url` should be resolved: never resolved, or resolved too long ago. */
  needsResolving(url: string): Promise<boolean>
  /** A cached thumbnail by the hash its path carries, or `null`. */
  thumbnail(hash: string): Promise<{ readonly body: Readable; readonly type: string } | null>
}

const DAY = 86_400_000

/** Query parameters no provider needs to identify content: dropped so they do not multiply one video into many cache rows. */
const TRACKING_PARAMETERS = /^(utm_\w+|si|feature|fbclid|gclid|mc_cid|mc_eid|igshid)$/u

/**
 * An embed address as the cache knows it: http(s), without its fragment or
 * tracking parameters, and at most 2 048 characters **once normalised** — a
 * raw address within the limit can grow past it when percent-encoded, and the
 * cache column would then refuse it after the provider was already called.
 */
export function parseEmbedUrl(raw: unknown): URL {
  const url = typeof raw === 'string' && raw.length <= 2048 ? URL.parse(raw.trim()) : null
  if (url !== null) {
    url.hash = ''
    for (const name of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.test(name)) url.searchParams.delete(name)
    }
  }
  if (
    url === null ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.toString().length > 2048
  ) {
    throw new CogentaError({
      code: 'EMBED_URL_INVALID',
      message: 'An embed address must be an http or https URL of at most 2048 characters.',
      hint: 'Paste the address of the video, the track or the post as the provider shows it.',
    })
  }
  return url
}

export function createEmbedPreviewService(
  options: EmbedPreviewServiceOptions,
): EmbedPreviewService {
  const now = options.now ?? ((): Date => new Date())
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init))
  const basePath = options.thumbnailBasePath ?? '/_cogenta/embeds'
  const freshFor = options.freshForMs ?? 30 * DAY
  const retryAfter = options.retryFailedAfterMs ?? DAY

  const view = (record: EmbedPreviewRecord): EmbedPreviewView => ({
    url: record.url,
    provider: record.provider as EmbedProvider,
    status: record.status,
    title: record.title,
    authorName: record.authorName,
    ratio: closestEmbedRatio(record.width, record.height),
    thumbnailPath:
      record.thumbnailKey === null ? null : `${basePath}/${embedPreviewHash(record.url)}`,
    thumbnailWidth: record.thumbnailWidth,
    thumbnailHeight: record.thumbnailHeight,
  })

  const unsupported = (url: string, provider: EmbedProvider): EmbedPreviewView => ({
    url,
    provider,
    status: 'unsupported',
    title: null,
    authorName: null,
    ratio: null,
    thumbnailPath: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
  })

  const isFresh = (record: EmbedPreviewRecord): boolean => {
    const age = now().getTime() - Date.parse(record.fetchedAt)
    return age < (record.status === 'ok' ? freshFor : retryAfter)
  }

  return {
    async resolve(raw) {
      const url = parseEmbedUrl(raw)
      const address = url.toString()
      const provider = detectEmbedProvider(url)
      if (!isResolvableProvider(provider)) return unsupported(address, provider)

      const cached = await options.store.get(address)
      if (cached !== null && isFresh(cached)) return view(cached)

      const resolved = await resolveEmbed(address, provider, { fetch: fetcher })
      let thumbnailKey: string | null = null
      if (resolved?.thumbnail != null) {
        // Named by its bytes: many addresses of one video share one file, so
        // pasting variants of an address cannot fill the disk with copies.
        const digest = createHash('sha256').update(resolved.thumbnail.bytes).digest('hex')
        thumbnailKey = `embeds/${digest}.${resolved.thumbnail.extension}`
        if (!(await options.storage.exists(thumbnailKey))) {
          await options.storage.put(thumbnailKey, resolved.thumbnail.bytes, {
            contentType: resolved.thumbnail.type,
          })
        }
      }
      const record: EmbedPreviewRecord =
        resolved === null
          ? {
              url: address,
              provider,
              status: 'failed',
              title: null,
              authorName: null,
              width: null,
              height: null,
              // A failure keeps the thumbnail a previous success left, if any.
              thumbnailKey: cached?.thumbnailKey ?? null,
              thumbnailType: cached?.thumbnailType ?? null,
              thumbnailWidth: cached?.thumbnailWidth ?? null,
              thumbnailHeight: cached?.thumbnailHeight ?? null,
              fetchedAt: now().toISOString(),
            }
          : {
              url: address,
              provider,
              status: 'ok',
              title: resolved.title,
              authorName: resolved.authorName,
              width: resolved.width,
              height: resolved.height,
              thumbnailKey,
              thumbnailType: resolved.thumbnail?.type ?? null,
              thumbnailWidth: resolved.thumbnail?.width ?? null,
              thumbnailHeight: resolved.thumbnail?.height ?? null,
              fetchedAt: now().toISOString(),
            }
      await options.store.put(record)
      return view(record)
    },

    async cached(urls) {
      // Keyed by the address as the caller holds it — a block keeps what the
      // editor pasted, tracking parameters and all — but looked up the way
      // `resolve` stored it, normalised.
      const normalised = new Map<string, string>()
      for (const raw of urls) {
        try {
          normalised.set(raw, parseEmbedUrl(raw).toString())
        } catch {
          // Not an address the cache could ever hold.
        }
      }
      const found = await options.store.getMany([...new Set(normalised.values())])
      const result = new Map<string, EmbedPreviewView>()
      for (const [raw, address] of normalised) {
        const record = found.get(address)
        if (record !== undefined) result.set(raw, view(record))
      }
      return result
    },

    async needsResolving(raw) {
      let url: URL
      try {
        url = parseEmbedUrl(raw)
      } catch {
        return false
      }
      if (!isResolvableProvider(detectEmbedProvider(url))) return false
      const cached = await options.store.get(url.toString())
      return cached === null || !isFresh(cached)
    },

    async thumbnail(hash) {
      if (!/^[0-9a-f]{64}$/u.test(hash)) return null
      const record = await options.store.byHash(hash)
      if (record === null || record.thumbnailKey === null || record.thumbnailType === null) {
        return null
      }
      if (!(await options.storage.exists(record.thumbnailKey))) return null
      return { body: await options.storage.get(record.thumbnailKey), type: record.thumbnailType }
    },
  }
}
