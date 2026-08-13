import type { RequestDescriptor, RouteRule, StrategyDecision } from './types.js'

/**
 * Which strategy answers which request, and why.
 *
 * The rule that governs every choice below: **a resource may be served from
 * cache without revalidation only when its URL changes whenever its content
 * changes.** Fingerprinted assets satisfy that. Nothing else on a CMS-driven
 * site does — an author republishes an article at the same URL, replaces an
 * image at the same path, fixes a typo in a JSON feed. Serving those cache-first
 * is exactly the "stale content forever" failure the L3 spec warns about.
 */

/**
 * A URL is treated as immutable when it lives under Astro's hashed asset
 * directory or carries a content hash in its filename. Both forms change on
 * every content change, which is the entire justification for cache-first.
 */
export const IMMUTABLE_ASSET_PATTERN = '(^/_astro/)|(\\.[0-9a-f]{8,}\\.[a-z0-9]+(?:$|\\?))'

/**
 * The default route table, in priority order. Each rule states its bucket, so
 * caches stay separable, and its cap, so no bucket can grow without bound.
 */
export const DEFAULT_ROUTES: readonly RouteRule[] = [
  {
    // HTML is the index of everything else: it names the asset URLs, the nav,
    // the current article. Stale HTML points at assets a purge has already
    // deleted, so a cache-first document is both wrong and broken. Network
    // first, with a short timeout so a captive portal or a dead mobile leg
    // falls back to the last copy instead of hanging on a white screen.
    id: 'documents',
    destinations: ['document'],
    pattern: null,
    crossOrigin: false,
    strategy: 'network-first',
    bucket: 'documents',
    maxEntries: 50,
    networkTimeoutMs: 3000,
  },
  {
    // Fingerprinted assets. The URL is a content hash, so the cached body can
    // never be wrong; revalidating it would only cost a round trip. This is the
    // one and only place cache-first is safe, and it is where the offline win
    // actually comes from.
    id: 'immutable-assets',
    destinations: ['script', 'style', 'font', 'worker'],
    pattern: IMMUTABLE_ASSET_PATTERN,
    crossOrigin: false,
    strategy: 'cache-first',
    bucket: 'assets',
    maxEntries: 200,
    networkTimeoutMs: null,
  },
  {
    // Scripts, stylesheets and fonts served from a stable URL. The body can
    // change under that URL, so cache-first would pin an old build; but they
    // are render-blocking, so network-first would cost a round trip on every
    // page. Stale-while-revalidate is the honest middle: fast now, correct on
    // the next navigation.
    id: 'mutable-assets',
    destinations: ['script', 'style', 'font'],
    pattern: null,
    crossOrigin: false,
    strategy: 'stale-while-revalidate',
    bucket: 'assets',
    maxEntries: 60,
    networkTimeoutMs: null,
  },
  {
    // Images are large, replaceable at the same path by an editor, and never
    // load-bearing for correctness: one page view showing yesterday's crop is a
    // cosmetic defect, not a wrong answer. Capped, because an image cache is
    // the one that fills a phone.
    id: 'images',
    destinations: ['image'],
    pattern: null,
    crossOrigin: false,
    strategy: 'stale-while-revalidate',
    bucket: 'images',
    maxEntries: 80,
    networkTimeoutMs: null,
  },
  {
    // API data. Never stale-while-revalidate: JSON drives what the interface
    // asserts, and rendering last week's data as if it were current is the
    // failure mode users report as "the site is lying". Network first, cached
    // only so that an offline reader still sees the last state they had, with
    // a longer timeout than documents because a list endpoint is legitimately
    // slower than a page.
    id: 'api-data',
    destinations: ['', 'empty'],
    pattern: '^/api/',
    crossOrigin: false,
    strategy: 'network-first',
    bucket: 'data',
    maxEntries: 40,
    networkTimeoutMs: 4000,
  },
  {
    // The manifest itself. Rarely changes, tiny, and needed for the install
    // prompt to appear offline.
    id: 'manifest',
    destinations: ['manifest'],
    pattern: null,
    crossOrigin: false,
    strategy: 'stale-while-revalidate',
    bucket: 'assets',
    maxEntries: 5,
    networkTimeoutMs: null,
  },
]

/**
 * Picks the strategy for one request.
 *
 * Pure, total, and free of any reference to module scope — this function is
 * inlined verbatim into the generated service worker (see `runtime-source.ts`)
 * so that the behaviour under test and the behaviour shipped are the same text.
 *
 * The bypasses come first and are deliberately generous. Every one of them is a
 * case where storing a response would produce a wrong answer later, and a
 * service worker that returns a wrong answer is worse than no service worker:
 * it is a wrong answer nobody can reproduce without clearing site data.
 */
export function chooseStrategy(
  request: RequestDescriptor,
  routes: readonly RouteRule[],
): StrategyDecision {
  const bypass = (reason: string): StrategyDecision => ({
    strategy: 'network-only',
    bucket: 'documents',
    maxEntries: null,
    networkTimeoutMs: null,
    ruleId: 'bypass',
    reason,
  })

  // The Cache API only keys on GET. A POST answered from a cache would be a
  // silent correctness bug, and a POST *stored* in one would be a data leak.
  if (request.method !== 'GET') return bypass(`method ${request.method} is not cacheable`)

  // The caller explicitly asked to skip caches: a hard reload, or a fetch with
  // `cache: 'no-store'`. Overruling that is how a service worker earns its
  // reputation for being impossible to bypass.
  if (request.cacheMode === 'no-store' || request.cacheMode === 'reload') {
    return bypass(`request cache mode ${request.cacheMode} forbids caching`)
  }

  // A ranged response is a fragment. Storing it and later matching a full
  // request against it hands back a truncated body — the classic broken-video
  // bug.
  if (request.hasRange) return bypass('ranged request has a partial body')

  let pathAndQuery: string
  let sameOrigin: boolean
  try {
    const parsed = new URL(request.url)
    sameOrigin = parsed.origin === request.origin
    pathAndQuery = parsed.pathname + parsed.search
  } catch {
    return bypass('request url could not be parsed')
  }

  // A navigation is a document even when the destination field is empty, which
  // it is on some engines for the very first request of a page.
  const destination = request.mode === 'navigate' ? 'document' : request.destination

  for (const rule of routes) {
    if (!sameOrigin && !rule.crossOrigin) continue
    if (rule.destinations.length > 0 && !rule.destinations.includes(destination)) continue
    if (rule.pattern !== null && !new RegExp(rule.pattern).test(pathAndQuery)) continue
    return {
      strategy: rule.strategy,
      bucket: rule.bucket,
      maxEntries: rule.maxEntries,
      networkTimeoutMs: rule.networkTimeoutMs,
      ruleId: rule.id,
      reason: `matched rule ${rule.id}`,
    }
  }

  // No rule claimed it, so we do not touch it. Defaulting to a cache here would
  // mean the service worker quietly takes ownership of resources nobody
  // reasoned about, including opaque cross-origin responses whose status it
  // cannot even read.
  return bypass(
    sameOrigin ? `no rule matches destination "${destination}"` : 'cross-origin request',
  )
}
