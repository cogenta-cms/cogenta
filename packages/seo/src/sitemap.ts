import { CogentaError } from '@cogenta/core'
import type { HreflangAlternate } from './hreflang.js'
import { buildHreflangMap } from './hreflang.js'
import { type IndexableOptions, indexableResources } from './indexable.js'
import type { SeoResource, SeoSite } from './types.js'
import { absoluteUrl, canonicalUrl } from './url.js'
import { renderXmlDocument, type XmlElement, xmlElementByteLength } from './xml.js'

/**
 * `sitemap.xml`, split and indexed when it has to be.
 *
 * The two limits are the protocol's, not a preference: sitemaps.org caps a
 * single file at **50 000 URLs and 50 MB uncompressed**, and a file that
 * exceeds either is rejected whole. Both are enforced, because a site can hit
 * the byte limit well before the URL limit once `xhtml:link` alternates are
 * included — twelve languages multiply the size of every entry by roughly
 * thirteen while the URL count stays put.
 */

/** sitemaps.org: 50 000 URLs per file, and the same cap on entries in an index. */
export const SITEMAP_MAX_URLS = 50_000

/** sitemaps.org: 50 MB uncompressed, counted as 50 × 2²⁰ bytes. */
export const SITEMAP_MAX_BYTES = 52_428_800

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

export type ChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

export interface SitemapUrl {
  readonly loc: string
  /** W3C datetime. An invalid one makes a crawler ignore the field, not the file. */
  readonly lastmod?: string
  readonly changefreq?: ChangeFrequency
  /** 0.0 to 1.0. Rounded to one decimal on output. */
  readonly priority?: number
  readonly alternates?: readonly HreflangAlternate[]
}

/** One file to write, with the site-relative path it must be served at. */
export interface SitemapFile {
  readonly path: string
  readonly contents: string
  /** True for the index that lists the others. Exactly one when there is a split. */
  readonly isIndex: boolean
  readonly urlCount: number
}

export interface SitemapOptions extends IndexableOptions {
  readonly maxUrls?: number
  readonly maxBytes?: number
  /** How many files an index may list. The protocol limit unless a crawler says otherwise. */
  readonly maxIndexEntries?: number
  /** Path of the single file, and of the index once there is a split. */
  readonly indexPath?: string
  /** Path of chunk `n`, one-based. */
  readonly chunkPath?: (index: number) => string
  /** `lastmod` of the index itself. Defaults to the newest child `lastmod`. */
  readonly lastmod?: string
}

const DEFAULT_INDEX_PATH = '/sitemap.xml'
const defaultChunkPath = (index: number): string => `/sitemap-${index}.xml`

function urlElement(url: SitemapUrl): XmlElement {
  const children: (XmlElement | null)[] = [{ name: 'loc', text: url.loc }]

  if (url.lastmod !== undefined) children.push({ name: 'lastmod', text: url.lastmod })
  if (url.changefreq !== undefined) children.push({ name: 'changefreq', text: url.changefreq })
  if (url.priority !== undefined) {
    children.push({ name: 'priority', text: clampPriority(url.priority) })
  }

  for (const alternate of url.alternates ?? []) {
    children.push({
      name: 'xhtml:link',
      attributes: { rel: 'alternate', hreflang: alternate.hreflang, href: alternate.href },
    })
  }

  return { name: 'url', children }
}

function clampPriority(priority: number): string {
  const bounded = Math.min(1, Math.max(0, priority))
  return bounded.toFixed(1)
}

/**
 * Bytes a chunk costs before any URL: declaration, root tag with both
 * namespaces, closing tag and newlines. Measured rather than estimated so the
 * budget stays right if the header ever changes.
 */
function chunkOverhead(): number {
  return Buffer.byteLength(renderXmlDocument(urlsetElement([])), 'utf8')
}

function urlsetElement(urls: readonly SitemapUrl[]): XmlElement {
  return {
    name: 'urlset',
    attributes: { xmlns: SITEMAP_NS, 'xmlns:xhtml': XHTML_NS },
    children: urls.map(urlElement),
  }
}

function splitIntoChunks(
  urls: readonly SitemapUrl[],
  maxUrls: number,
  maxBytes: number,
): readonly (readonly SitemapUrl[])[] {
  const overhead = chunkOverhead()
  const chunks: SitemapUrl[][] = []
  let current: SitemapUrl[] = []
  let size = overhead

  for (const url of urls) {
    // +1 for the newline the renderer puts between siblings.
    const cost = xmlElementByteLength(urlElement(url), 1) + 1

    if (overhead + cost > maxBytes) {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `A single sitemap entry for "${url.loc}" exceeds the ${maxBytes}-byte file limit.`,
        hint: 'It almost certainly carries far too many hreflang alternates. A sitemap entry cannot be split across files.',
        details: { loc: url.loc, bytes: cost, maxBytes },
      })
    }

    if (current.length >= maxUrls || size + cost > maxBytes) {
      chunks.push(current)
      current = []
      size = overhead
    }

    current.push(url)
    size += cost
  }

  if (current.length > 0 || chunks.length === 0) chunks.push(current)
  return chunks
}

/**
 * The files to write for a set of URLs.
 *
 * One file below the limits, an index plus N chunks above them. The caller
 * writes what it gets and never has to know which case it is in — a shape that
 * makes the split untestable in production is how sites discover at 60 000 URLs
 * that nobody ever exercised the second branch.
 */
export function buildSitemap(
  site: SeoSite,
  urls: readonly SitemapUrl[],
  options: SitemapOptions = {},
): readonly SitemapFile[] {
  const maxUrls = options.maxUrls ?? SITEMAP_MAX_URLS
  const maxBytes = options.maxBytes ?? SITEMAP_MAX_BYTES

  if (maxUrls < 1 || maxBytes < 1) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: 'A sitemap file must allow at least one URL and one byte.',
      hint: `Leave maxUrls and maxBytes unset to use the protocol limits (${SITEMAP_MAX_URLS} URLs, ${SITEMAP_MAX_BYTES} bytes).`,
      details: { maxUrls, maxBytes },
    })
  }

  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH
  const chunkPath = options.chunkPath ?? defaultChunkPath
  const chunks = splitIntoChunks(urls, maxUrls, maxBytes)

  if (chunks.length === 1) {
    const only = chunks[0] ?? []
    return [
      {
        path: indexPath,
        contents: renderXmlDocument(urlsetElement(only)),
        isIndex: false,
        urlCount: only.length,
      },
    ]
  }

  // The index cap is the protocol's own, deliberately *not* `maxUrls`. The two
  // limits happen to share a number, and conflating them means that lowering
  // `maxUrls` — which a caller does to force a split, and a test does to
  // exercise one — also lowers how many files an index may list, so the split
  // it just asked for is rejected.
  const maxIndexEntries = options.maxIndexEntries ?? SITEMAP_MAX_URLS
  if (chunks.length > maxIndexEntries) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `The site needs ${chunks.length} sitemap files, more than the ${maxIndexEntries} an index may list.`,
      hint: 'A sitemap index cannot itself be indexed. Split the site across several hosts, or raise maxUrls so each file holds more.',
      details: { files: chunks.length, maxIndexEntries },
    })
  }

  const files: SitemapFile[] = chunks.map((chunk, position) => ({
    path: chunkPath(position + 1),
    contents: renderXmlDocument(urlsetElement(chunk)),
    isIndex: false,
    urlCount: chunk.length,
  }))

  const lastmod = options.lastmod ?? newestLastmod(urls)
  const index: XmlElement = {
    name: 'sitemapindex',
    attributes: { xmlns: SITEMAP_NS },
    children: files.map((file) => ({
      name: 'sitemap',
      children: [
        { name: 'loc', text: absoluteUrl(site, file.path) },
        lastmod === undefined ? null : { name: 'lastmod', text: lastmod },
      ],
    })),
  }

  return [
    {
      path: indexPath,
      contents: renderXmlDocument(index),
      isIndex: true,
      urlCount: files.length,
    },
    ...files,
  ]
}

function newestLastmod(urls: readonly SitemapUrl[]): string | undefined {
  let newest: string | undefined
  for (const url of urls) {
    if (url.lastmod === undefined) continue
    if (newest === undefined || url.lastmod > newest) newest = url.lastmod
  }
  return newest
}

/**
 * Sitemap URLs for a set of resources: published only, alternates attached.
 *
 * `lastmod` is `updatedAt` rather than `publishedAt`: the field answers "has
 * this changed since you last fetched it", which is what makes a crawler come
 * back for a corrected article.
 */
export function sitemapUrlsFor(
  site: SeoSite,
  resources: readonly SeoResource[],
  options: SitemapOptions = {},
): readonly SitemapUrl[] {
  const published = indexableResources(site, resources, options)
  const hreflang = buildHreflangMap(site, resources, options)

  const urls: SitemapUrl[] = []
  for (const resource of published) {
    const loc = canonicalUrl(site, resource)
    if (loc === null) continue

    const alternates = hreflang.get(resource.entry.id)
    urls.push({
      loc,
      lastmod: resource.entry.updatedAt,
      ...(alternates === undefined ? {} : { alternates }),
    })
  }
  return urls
}
