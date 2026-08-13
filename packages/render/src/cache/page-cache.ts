import { type CacheDriver, CogentaError, type Logger } from '@cogenta/core'
import { createReadRecorder, type ReadRecorder } from './recorder.js'
import { type ContentChange, normalisePath, tagsForChanges } from './tags.js'

/**
 * The render cache: a page in, the content it read out, tags in between.
 *
 * It takes a `CacheDriver` and never names one. Memory, file and Redis all
 * implement `invalidateTags`, so the render cache is correct on all three and
 * a site that has no Redis loses shared storage, not correctness (rule R1).
 *
 * Since ADR-0016 a theme reads over HTTP, so a miss costs a round trip per
 * read. This cache is what pays that back: a hit costs one `get`.
 */

/** What identifies a rendered page. Anything that changes the HTML belongs here. */
export interface PageRequest {
  readonly locale: string
  readonly url: URL | string
  /**
   * Extra discriminators — active skin, build target, device class. A page
   * that varies on something absent from here is a page served wrong to half
   * its readers, so hosts must declare every axis they vary on.
   */
  readonly variant?: Readonly<Record<string, string>> | undefined
}

export interface RenderCacheOptions {
  readonly cache: CacheDriver
  readonly logger?: Logger | undefined
  /** Seconds. Omitted means "until invalidated", which is the point of tags. */
  readonly ttl?: number | undefined
  /** Key prefix. Bump it to drop every page without touching other cache users. */
  readonly namespace?: string | undefined
  /** Called on every swallowed cache failure. Injected by hosts with alerting. */
  readonly onError?: ((error: CogentaError) => void) | undefined
}

export interface RenderResult<T> {
  readonly value: T
  /** True when the value came from the cache and nothing was rendered. */
  readonly cached: boolean
  /** Dependencies of the page. Read back from the entry on a hit. */
  readonly tags: readonly string[]
  readonly key: string
}

export interface RenderCache {
  /** The key a request maps to. Exposed so a host can purge one page by hand. */
  keyFor(request: PageRequest): string
  render<T>(
    request: PageRequest,
    produce: (recorder: ReadRecorder) => Promise<T>,
  ): Promise<RenderResult<T>>
  /** Drops one page, whatever its dependencies. */
  forget(request: PageRequest): Promise<void>
  /** Publication, unpublication, deletion. Throws if the cache refuses. */
  invalidate(changes: ContentChange | readonly ContentChange[]): Promise<void>
  invalidateTags(tags: readonly string[]): Promise<void>
  clear(): Promise<void>
}

const DEFAULT_NAMESPACE = 'render'

/**
 * Stored envelope.
 *
 * The value is wrapped rather than stored bare so that a page whose value is
 * `null` is still a hit: `CacheDriver.get` returns `null` for "absent", and a
 * bare `null` value would be re-rendered on every request forever.
 */
interface CachedPage<T> {
  readonly value: T
  readonly tags: readonly string[]
}

export function createRenderCache(options: RenderCacheOptions): RenderCache {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE
  const logger = options.logger
  const cache = options.cache

  /**
   * A cache that throws is worse than no cache: it turns a slow page into a
   * broken one. Every read and write is therefore swallowed, reported, and the
   * render carries on as if the cache were empty.
   *
   * Invalidation is the deliberate exception, and it is handled outside this
   * helper: a publish that silently failed to invalidate leaves stale pages up
   * with nothing to notice it, so the caller must hear about it.
   */
  async function attempt<T>(
    operation: string,
    key: string,
    run: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await run()
    } catch (cause) {
      const error = cacheFailure(operation, key, cause)
      logger?.warn('render cache unavailable, serving without it', {
        code: error.code,
        operation,
        key,
      })
      options.onError?.(error)
      return undefined
    }
  }

  function keyFor(request: PageRequest): string {
    return pageCacheKey(namespace, request)
  }

  return {
    keyFor,

    render: async <T>(
      request: PageRequest,
      produce: (recorder: ReadRecorder) => Promise<T>,
    ): Promise<RenderResult<T>> => {
      const key = keyFor(request)

      const hit = await attempt('get', key, () => cache.get<CachedPage<T>>(key))
      if (hit !== undefined && hit !== null) {
        return { value: hit.value, cached: true, tags: hit.tags, key }
      }

      // Outside `attempt`: a failing render is a real failure and must surface.
      // Only the cache is allowed to fail quietly here.
      const recorder = createReadRecorder()
      const value = await produce(recorder)
      const tags = recorder.tags()

      await attempt('set', key, () =>
        cache.set<CachedPage<T>>(
          key,
          { value, tags },
          { tags, ...(options.ttl === undefined ? {} : { ttl: options.ttl }) },
        ),
      )

      return { value, cached: false, tags, key }
    },

    forget: async (request) => {
      const key = keyFor(request)
      await attempt('delete', key, () => cache.delete(key))
    },

    invalidate: async (changes) => {
      await invalidate(cache, tagsForChanges(asChanges(changes)))
    },

    invalidateTags: async (tags) => {
      await invalidate(cache, tags)
    },

    clear: async () => {
      await attempt('clear', namespace, () => cache.clear())
    },
  }
}

function isSingleChange(input: ContentChange | readonly ContentChange[]): input is ContentChange {
  return !Array.isArray(input)
}

function asChanges(input: ContentChange | readonly ContentChange[]): readonly ContentChange[] {
  return isSingleChange(input) ? [input] : input
}

async function invalidate(cache: CacheDriver, tags: readonly string[]): Promise<void> {
  if (tags.length === 0) return
  try {
    await cache.invalidateTags(tags)
  } catch (cause) {
    throw new CogentaError({
      code: 'CACHE_FAILED',
      message: `The render cache could not invalidate ${tags.length} tag(s) after a content change.`,
      hint: 'Pages that embed this content will keep serving the old version until the cache is reachable again. Check the cache driver, then re-run the invalidation or clear the cache.',
      cause,
      details: { tags },
    })
  }
}

function cacheFailure(operation: string, key: string, cause: unknown): CogentaError {
  return new CogentaError({
    code: 'CACHE_FAILED',
    message: `The render cache failed to ${operation} "${key}".`,
    hint: 'The page was rendered anyway. Check the cache driver — an unreachable cache costs latency, not correctness.',
    cause,
    details: { operation, key },
  })
}

/**
 * The cache key of a page.
 *
 * Built from origin-independent parts — one site is one cache — and from the
 * search string, because a query parameter that changes the HTML must change
 * the key. Parameters are sorted so that `?a=1&b=2` and `?b=2&a=1` are one
 * entry rather than two copies that expire independently.
 */
export function pageCacheKey(namespace: string, request: PageRequest): string {
  const url = typeof request.url === 'string' ? parsePath(request.url) : request.url
  const search = sortedQuery(url.searchParams)
  const parts = [namespace, 'page', request.locale, normalisePath(url.pathname) + search]

  const variant = request.variant
  if (variant !== undefined) {
    const entries = Object.entries(variant).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    for (const [name, value] of entries) parts.push(`${name}=${value}`)
  }

  return parts.join('|')
}

/** A path, possibly with a query, and possibly a full URL. Base is irrelevant. */
function parsePath(value: string): URL {
  return new URL(value, 'https://page.invalid')
}

function sortedQuery(parameters: URLSearchParams): string {
  const pairs = [...parameters.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (pairs.length === 0) return ''
  return `?${pairs.map(([name, value]) => `${name}=${value}`).join('&')}`
}
