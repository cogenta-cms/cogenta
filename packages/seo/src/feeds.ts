import { condense, extractRichText } from '@cogenta/schema'
import { type IndexableOptions, indexableResources } from './indexable.js'
import type { SeoResource, SeoSite } from './types.js'
import { absoluteUrl, canonicalUrl } from './url.js'
import { renderXmlDocument, type XmlElement } from './xml.js'

/**
 * RSS 2.0 and Atom 1.0, from the same item list.
 *
 * Both are produced because both are still consumed: readers and podcast
 * clients speak RSS, while Atom is the one with a specified date format and a
 * real notion of entry identity. Generating one from the other at runtime would
 * be cheaper and is exactly how feeds acquire subtly different content.
 *
 * Content is escaped, never wrapped in `CDATA`. `CDATA` looks like it removes
 * the escaping problem and instead moves it: the sequence `]]>` inside an
 * article — which appears in any post about XML — terminates the section early
 * and corrupts the feed, with no visible symptom until a reader silently stops
 * updating.
 */

export interface FeedItem {
  readonly title: string
  readonly link: string
  /** Globally unique and permanent. The canonical URL, unless the entry moves. */
  readonly id: string
  /** RFC 3339. Converted to RFC 822 for RSS. */
  readonly updated: string
  readonly published?: string
  readonly summary?: string
  readonly authorName?: string
  readonly categories?: readonly string[]
}

export interface FeedInput {
  readonly site: SeoSite
  readonly title?: string
  readonly description?: string
  /** Site-relative path this feed is served at, for the `self` link. */
  readonly selfPath: string
  readonly language?: string
  readonly items: readonly FeedItem[]
  /** Injected so a feed is byte-stable in tests. */
  readonly updated?: string
}

const RSS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RSS_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * RFC 822 date, as RSS 2.0 requires.
 *
 * Hand-rolled rather than taken from `toUTCString`: that method emits `GMT`,
 * and while RFC 822 allows the name, several validators and at least one large
 * reader expect the `+0000` numeric offset. Building it also keeps the day and
 * month names in English regardless of the server locale, which `toLocaleString`
 * would not.
 */
export function toRfc822(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const day = RSS_DAYS[date.getUTCDay()] ?? 'Sun'
  const month = RSS_MONTHS[date.getUTCMonth()] ?? 'Jan'
  const pad = (n: number): string => String(n).padStart(2, '0')

  return `${day}, ${pad(date.getUTCDate())} ${month} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
}

function newestUpdate(items: readonly FeedItem[], fallback: string | undefined): string {
  let newest = fallback
  for (const item of items) {
    if (newest === undefined || item.updated > newest) newest = item.updated
  }
  return newest ?? new Date(0).toISOString()
}

export function renderRssFeed(input: FeedInput): string {
  const { site, items } = input
  const selfUrl = absoluteUrl(site, input.selfPath)

  const channel: (XmlElement | null)[] = [
    { name: 'title', text: input.title ?? site.name },
    { name: 'link', text: absoluteUrl(site, '/') },
    { name: 'description', text: input.description ?? site.description ?? site.name },
    { name: 'language', text: input.language ?? site.defaultLocale },
    { name: 'lastBuildDate', text: toRfc822(newestUpdate(items, input.updated)) },
    // The self link is an Atom element inside RSS. It is not decoration: it is
    // how a reader that has been redirected knows the feed's real address, and
    // how the feed validators identify duplicates.
    {
      name: 'atom:link',
      attributes: { href: selfUrl, rel: 'self', type: 'application/rss+xml' },
    },
    { name: 'generator', text: 'Cogenta' },
  ]

  for (const item of items) {
    const children: (XmlElement | null)[] = [
      { name: 'title', text: item.title },
      { name: 'link', text: item.link },
      // `isPermaLink="true"` would tell a reader the guid is a fetchable URL.
      // It usually is, but a moved entry keeps its id and stops being one, so
      // the safe declaration is the one that stays true.
      { name: 'guid', attributes: { isPermaLink: 'false' }, text: item.id },
      { name: 'pubDate', text: toRfc822(item.published ?? item.updated) },
    ]
    if (item.summary !== undefined) children.push({ name: 'description', text: item.summary })
    if (item.authorName !== undefined) {
      // RSS `author` is specified as an email address; a bare name there fails
      // validation. `dc:creator` is the element every reader actually displays.
      children.push({ name: 'dc:creator', text: item.authorName })
    }
    for (const category of item.categories ?? []) {
      children.push({ name: 'category', text: category })
    }
    channel.push({ name: 'item', children })
  }

  return renderXmlDocument({
    name: 'rss',
    attributes: {
      version: '2.0',
      'xmlns:atom': 'http://www.w3.org/2005/Atom',
      'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    },
    children: [{ name: 'channel', children: channel }],
  })
}

export function renderAtomFeed(input: FeedInput): string {
  const { site, items } = input
  const selfUrl = absoluteUrl(site, input.selfPath)

  const children: (XmlElement | null)[] = [
    { name: 'title', text: input.title ?? site.name },
    // The feed's own id must be a permanent IRI, and must not change when the
    // feed moves — hence the site root rather than the feed URL.
    { name: 'id', text: absoluteUrl(site, '/') },
    { name: 'updated', text: newestUpdate(items, input.updated) },
    { name: 'link', attributes: { rel: 'self', type: 'application/atom+xml', href: selfUrl } },
    {
      name: 'link',
      attributes: { rel: 'alternate', type: 'text/html', href: absoluteUrl(site, '/') },
    },
    { name: 'generator', text: 'Cogenta' },
  ]
  if (input.description !== undefined || site.description !== undefined) {
    children.push({ name: 'subtitle', text: input.description ?? site.description ?? '' })
  }

  for (const item of items) {
    const entry: (XmlElement | null)[] = [
      { name: 'title', text: item.title },
      { name: 'id', text: item.id },
      { name: 'updated', text: item.updated },
      { name: 'link', attributes: { rel: 'alternate', type: 'text/html', href: item.link } },
    ]
    if (item.published !== undefined) entry.push({ name: 'published', text: item.published })
    if (item.summary !== undefined) {
      entry.push({ name: 'summary', attributes: { type: 'text' }, text: item.summary })
    }
    if (item.authorName !== undefined) {
      entry.push({ name: 'author', children: [{ name: 'name', text: item.authorName }] })
    }
    for (const category of item.categories ?? []) {
      entry.push({ name: 'category', attributes: { term: category } })
    }
    children.push({ name: 'entry', children: entry })
  }

  return renderXmlDocument({
    name: 'feed',
    attributes: {
      xmlns: 'http://www.w3.org/2005/Atom',
      'xml:lang': input.language ?? site.defaultLocale,
    },
    children,
  })
}

export interface FeedItemsOptions extends IndexableOptions {
  /** Feeds are a recency list, not an archive. Defaults to 50. */
  readonly limit?: number
  readonly summaryLength?: number
}

const DEFAULT_FEED_LIMIT = 50
const DEFAULT_SUMMARY_LENGTH = 400

const SUMMARY_FIELDS = ['excerpt', 'description', 'summary', 'subtitle', 'teaser']
const TITLE_FIELDS = ['title', 'name', 'label', 'heading']

function pick(resource: SeoResource, candidates: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    if (resource.collection.fields[candidate] === undefined) continue
    const value = resource.entry.values[candidate]
    if (typeof value === 'string' && value.trim().length > 0) return condense(value)
  }
  return undefined
}

function bodySummary(resource: SeoResource, limit: number): string | undefined {
  for (const [name, field] of Object.entries(resource.collection.fields)) {
    if (field.kind !== 'richText') continue
    const text = extractRichText(resource.entry.values[name])
    if (text.length === 0) continue
    return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
  }
  return undefined
}

/**
 * Feed items for a set of resources, newest first.
 *
 * Drafts are removed by `indexableResources` before anything else happens. A
 * feed is the one output that cannot be retracted: readers cache, and a digest
 * mail forwards. So the filter is not an option here and there is no parameter
 * to turn it off.
 */
export function feedItemsFor(
  site: SeoSite,
  resources: readonly SeoResource[],
  options: FeedItemsOptions = {},
): readonly FeedItem[] {
  const summaryLength = options.summaryLength ?? DEFAULT_SUMMARY_LENGTH
  const published = indexableResources(site, resources, options)

  const items: FeedItem[] = []
  for (const resource of published) {
    const link = canonicalUrl(site, resource)
    if (link === null) continue

    const summary = pick(resource, SUMMARY_FIELDS) ?? bodySummary(resource, summaryLength)
    items.push({
      title: pick(resource, TITLE_FIELDS) ?? site.name,
      link,
      id: link,
      updated: resource.entry.updatedAt,
      ...(resource.entry.publishedAt === null ? {} : { published: resource.entry.publishedAt }),
      ...(summary === undefined ? {} : { summary }),
    })
  }

  return items
    .sort((a, b) => (b.published ?? b.updated).localeCompare(a.published ?? a.updated))
    .slice(0, options.limit ?? DEFAULT_FEED_LIMIT)
}
