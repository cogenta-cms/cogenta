/**
 * The vocabulary of the PWA layer.
 *
 * Everything here is *data*, and that is the whole design. A route rule is a
 * JSON-serialisable record, not a closure, because the same rule table has to
 * be readable by three different readers: the unit tests in Node, the generated
 * service worker running in a browser, and a human trying to work out why a
 * page served stale content. A table of closures would only be readable by the
 * first two, and only the first one would be testable.
 */

/** How a response is obtained, and whether the cache may answer instead. */
export type CacheStrategy =
  /** Ask the network; fall back to the cache only when the network fails. */
  | 'network-first'
  /** Answer from the cache; only go to the network on a miss. */
  | 'cache-first'
  /** Answer from the cache and refresh it in the background. */
  | 'stale-while-revalidate'
  /** Never touch the cache. The service worker does not even intercept. */
  | 'network-only'

/**
 * Caches are split by bucket so that one kind of resource can be evicted or
 * capped without touching another: images must be capped (they are unbounded),
 * documents must not (they are the only thing that works offline).
 */
export type CacheBucket = 'shell' | 'documents' | 'assets' | 'images' | 'data'

export const CACHE_BUCKETS: readonly CacheBucket[] = [
  'shell',
  'documents',
  'assets',
  'images',
  'data',
]

/**
 * One routing rule. Fields that may be absent are typed `| null` rather than
 * optional: this record is serialised into the generated service worker, and
 * `undefined` does not survive `JSON.stringify`. A missing field would then
 * mean something different on each side of the wire.
 */
export interface RouteRule {
  /** Stable identifier, reported in the decision so a miss can be traced. */
  readonly id: string
  /**
   * `Request.destination` values this rule answers for. Empty means "any
   * destination". `''` is the destination of a plain `fetch()`.
   */
  readonly destinations: readonly string[]
  /** Regular expression source, matched against `pathname + search`. */
  readonly pattern: string | null
  /** Whether the rule also applies to cross-origin requests. */
  readonly crossOrigin: boolean
  readonly strategy: CacheStrategy
  readonly bucket: CacheBucket
  /** Cap on stored entries for this bucket. `null` means uncapped. */
  readonly maxEntries: number | null
  /** How long the network gets before the cache answers. `null` means no cap. */
  readonly networkTimeoutMs: number | null
}

/**
 * A request reduced to the fields a routing decision actually needs.
 *
 * This is not `Request`. The render package compiles against ES2023 without the
 * DOM library, and more importantly a decision function that takes a real
 * `Request` can only be tested inside a browser. Reducing the request to seven
 * scalars is what moves the routing decision into a unit test.
 */
export interface RequestDescriptor {
  readonly method: string
  readonly url: string
  /** Origin of the service worker itself, used to detect cross-origin traffic. */
  readonly origin: string
  /** `Request.destination`: `'document'`, `'script'`, `'image'`, `''`… */
  readonly destination: string
  /** `Request.mode`: `'navigate'` marks a page load. */
  readonly mode: string
  /** `Request.cache`: `'no-store'` and `'reload'` are the user overruling us. */
  readonly cacheMode: string
  /** A ranged request asks for part of a body; a cache entry is a whole body. */
  readonly hasRange: boolean
}

export interface StrategyDecision {
  readonly strategy: CacheStrategy
  readonly bucket: CacheBucket
  readonly maxEntries: number | null
  readonly networkTimeoutMs: number | null
  /** Rule that matched, or a `bypass:*` marker when nothing did. */
  readonly ruleId: string
  /** Why this decision was reached. Present so a log line is diagnosable. */
  readonly reason: string
}

export interface PwaConfig {
  /**
   * Namespace for every cache this site owns. Other applications may share the
   * origin; purging must never touch their caches.
   */
  readonly cachePrefix: string
  /**
   * Cache generation. Changing it makes the previous generation garbage, which
   * is what the activation purge collects. Derive it with `computeCacheVersion`
   * rather than bumping it by hand.
   */
  readonly version: string
  /** URL of the offline page. Precached, and served when a navigation fails. */
  readonly offlineUrl: string
  /**
   * Everything precached at install. Keep it to the offline page and the shell:
   * a large precache turns every deploy into a full re-download, which is the
   * main reason PWAs feel heavier than the site they wrap.
   */
  readonly precache: readonly string[]
  readonly routes: readonly RouteRule[]
}
