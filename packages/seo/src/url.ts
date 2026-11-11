import { CogentaError } from '@cogenta/core'
import {
  buildPath,
  type CollectionDefinition,
  type ContentEntry,
  isOptionalRouteParam,
  type TermSlugs,
  termSegmentsOf,
} from '@cogenta/schema'
import type { SeoResource, SeoSite } from './types.js'

/**
 * Every URL this package emits is absolute, and every one of them is built
 * here.
 *
 * Sitemaps, feeds and `hreflang` all reject relative URLs, and a canonical that
 * disagrees with the sitemap by a trailing slash is treated as a different page
 * — the single most common cause of "Google indexed the wrong URL". One
 * function, one form.
 */

/** `https://example.com/blog/` and `https://example.com/blog` are the same origin. */
export function normaliseBaseUrl(baseUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `The site base URL "${baseUrl}" is not a URL.`,
      hint: 'Give an absolute origin, protocol included: https://example.com',
      details: { baseUrl },
    })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `The site base URL uses "${parsed.protocol}", which no crawler follows.`,
      hint: 'Use http or https. Sitemaps and feeds carry absolute http(s) URLs only.',
      details: { baseUrl },
    })
  }

  const path = parsed.pathname.replace(/(?<!\/)\/+$/u, '')
  return `${parsed.origin}${path}`
}

/**
 * An absolute URL for a site-relative path.
 *
 * The path is expected to be already encoded — `buildPath` percent-encodes each
 * segment — so it is concatenated rather than passed through `new URL`, which
 * would double-encode a `%` that is already an escape.
 */
export function absoluteUrl(site: SeoSite, path: string): string {
  const base = normaliseBaseUrl(site.baseUrl)
  if (path.length === 0 || path === '/') return `${base}/`
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * The route parameters an entry supplies.
 *
 * A pattern segment `:slug` reads `values.slug`; `:id` reads the system field,
 * since it is the only parameter an entry always has and the natural fallback
 * for a collection with no slug.
 */
export function routeParams(
  collection: CollectionDefinition,
  entry: ContentEntry,
  categories: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const pattern = collection.routing?.pattern ?? ''
  const params: Record<string, string> = {}

  for (const segment of pattern.split('/')) {
    if (!segment.startsWith(':')) continue
    const name = segment.slice(1)

    if (name === 'id') {
      params[name] = entry.id
      continue
    }

    // A category segment is the slug of the term, which the entry only holds
    // the id of: the caller resolves it (`SeoResource.categories`).
    if (isOptionalRouteParam(collection, name)) {
      const slug = categories[name]
      if (slug !== undefined && slug.length > 0) params[name] = slug
      continue
    }

    const value = entry.values[name]
    if (typeof value === 'string' && value.length > 0) {
      params[name] = value
      continue
    }
    if (typeof value === 'number') {
      params[name] = String(value)
    }
  }

  return params
}

/** True when the collection can produce a URL at all. */
export function hasRoute(collection: CollectionDefinition): boolean {
  return collection.routing !== undefined
}

/**
 * The canonical, absolute URL of an entry, or null when it has no route.
 *
 * Null rather than an exception: a collection without `routing` is a perfectly
 * ordinary thing — an author, a tag, a site setting — and asking "what is the
 * canonical URL of every entry" must not blow up on the first one that has
 * none.
 */
export function canonicalUrl(site: SeoSite, resource: SeoResource): string | null {
  const { collection, entry } = resource
  const routing = collection.routing
  if (routing === undefined) return null

  const params = routeParams(collection, entry, resource.categories)
  for (const segment of routing.pattern.split('/')) {
    if (!segment.startsWith(':')) continue
    const name = segment.slice(1)
    // A category segment is left out of the address of an entry that has none.
    if (params[name] === undefined && !isOptionalRouteParam(collection, name)) return null
  }

  const localised = routing.locale === true
  const path = buildPath(collection, params, localised ? entry.locale : undefined)

  if (localised && site.unprefixedDefaultLocale === true && entry.locale === site.defaultLocale) {
    const prefix = `/${encodeURIComponent(entry.locale)}`
    const stripped = path.slice(prefix.length)
    return absoluteUrl(site, homeAddress(site, stripped.length === 0 ? '/' : stripped))
  }

  return absoluteUrl(site, homeAddress(site, path))
}

/**
 * `/` for the site's home path, `/<locale>/` for its translation: the
 * addresses the server answers the home page at, rather than the path it
 * redirects from.
 */
function homeAddress(site: SeoSite, path: string): string {
  const home = site.homePath
  if (home === undefined || home === '' || home === '/') return path
  const trimmed = path.replace(/\/+$/u, '')
  if (trimmed === home) return '/'
  const match = /^\/([^/]+)(\/.*)$/u.exec(trimmed)
  if (
    match !== null &&
    match[2] === home &&
    (site.locales ?? []).includes(decodeURIComponent(match[1] ?? ''))
  ) {
    return `/${match[1]}/`
  }
  return path
}

/**
 * An entry and its collection as the SEO layer reads them, with the category
 * segment of its URL resolved (`schema@2.5`). Every place that builds a
 * `SeoResource` for a routed entry goes through this, so a canonical URL, a
 * sitemap line and an `hreflang` alternate cannot disagree about the address.
 */
export async function seoResourceOf<TEntry extends ContentEntry>(
  collection: CollectionDefinition,
  entry: TEntry,
  terms: TermSlugs | undefined,
): Promise<SeoResource<TEntry>> {
  const categories = await termSegmentsOf(collection, entry, terms)
  return Object.keys(categories).length === 0
    ? { collection, entry }
    : { collection, entry, categories }
}
