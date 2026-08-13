import type { CollectionDefinition, FieldDefinition } from '@cogenta/schema'
import { condense, extractRichText } from '@cogenta/schema'
import type { SeoImage, SeoReference, SeoResolvers, SeoResource, SeoSite } from './types.js'
import { canonicalUrl } from './url.js'

/**
 * JSON-LD **derived from the schema**, never typed by hand (L3 § Socle SEO).
 *
 * The spec is explicit: an `article` collection produces a schema.org `Article`
 * with no intervention. That constraint is what makes structured data survive
 * — a hand-written JSON-LD block is a second copy of the content that stops
 * matching the first one within a week, and Google penalises exactly that
 * divergence.
 *
 * So the mapping has two halves, and both are declarative:
 *
 * 1. **Collection → `@type`**, from the collection's own name and, failing
 *    that, from the shape of its fields.
 * 2. **Field → property**, from the field's `kind` and name.
 *
 * Anything the mapping cannot justify is left out. Incomplete structured data
 * is ignored by a crawler; wrong structured data earns a manual action.
 */

/** A JSON-LD value. Closed on purpose: no `any` may enter the graph. */
export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue | undefined }

export type JsonLdObject = { readonly [key: string]: JsonLdValue | undefined }

export interface JsonLdOptions {
  readonly resolvers?: SeoResolvers
  /**
   * Force the schema.org type of a collection: `{ article: 'BlogPosting' }`.
   *
   * The escape hatch exists because "is a `recipe` a `Recipe` or a
   * `HowTo`" is an editorial decision no amount of field inspection settles.
   */
  readonly types?: Readonly<Record<string, string>>
  /** Emitted as `publisher`. Usually the site's organisation. */
  readonly publisher?: SeoReference
  /** Cuts `articleBody`, which is otherwise the whole article in the page head. */
  readonly maxBodyLength?: number
}

/**
 * Collection name → schema.org type.
 *
 * Names are matched after lower-casing and stripping non-letters, so `blogPost`,
 * `blog_post` and `BlogPost` all land on the same row. The list is short and
 * covers what a CMS actually models; everything else falls through to the
 * shape-based rules below, which is the honest answer for a bespoke collection.
 */
const TYPE_BY_NAME: Readonly<Record<string, string>> = {
  article: 'Article',
  post: 'BlogPosting',
  blogpost: 'BlogPosting',
  news: 'NewsArticle',
  newsarticle: 'NewsArticle',
  page: 'WebPage',
  author: 'Person',
  person: 'Person',
  product: 'Product',
  event: 'Event',
  recipe: 'Recipe',
  faq: 'FAQPage',
  organization: 'Organization',
  organisation: 'Organization',
  company: 'Organization',
  job: 'JobPosting',
  course: 'Course',
  book: 'Book',
  video: 'VideoObject',
  tag: 'Thing',
  category: 'Thing',
}

/** Types whose main text property is `articleBody` and that carry a `headline`. */
const ARTICLE_TYPES: ReadonlySet<string> = new Set([
  'Article',
  'BlogPosting',
  'NewsArticle',
  'TechArticle',
  'Report',
])

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/gu, '')
}

function fieldsOf(collection: CollectionDefinition): readonly [string, FieldDefinition][] {
  return Object.entries(collection.fields)
}

/**
 * The schema.org type of a collection.
 *
 * Order matters: an explicit override, then the name, then the shape. The
 * shape rule is deliberately blunt — long text plus a publication date is an
 * article, and everything else is a `WebPage` — because a subtler heuristic
 * would be a heuristic nobody can predict from reading the collection.
 */
export function schemaTypeFor(
  collection: CollectionDefinition,
  options: JsonLdOptions = {},
): string {
  const override = options.types?.[collection.name]
  if (override !== undefined) return override

  const byName = TYPE_BY_NAME[normaliseName(collection.name)]
  if (byName !== undefined) return byName

  const fields = fieldsOf(collection)
  const hasProse = fields.some(([, field]) => field.kind === 'richText')
  const hasDate = fields.some(
    ([name, field]) =>
      (field.kind === 'datetime' || field.kind === 'date') && /publish|date/iu.test(name),
  )

  if (hasProse && hasDate) return 'Article'
  if (collection.routing !== undefined) return 'WebPage'
  return 'Thing'
}

/** Field names that mean "the human-readable label of this thing". */
const NAME_FIELDS = ['title', 'name', 'label', 'heading']
/** Field names that mean "the short summary". */
const DESCRIPTION_FIELDS = ['excerpt', 'description', 'summary', 'subtitle', 'teaser', 'abstract']

function firstStringValue(
  resource: SeoResource,
  candidates: readonly string[],
  kinds: readonly FieldDefinition['kind'][],
): string | undefined {
  for (const candidate of candidates) {
    const field = resource.collection.fields[candidate]
    if (field === undefined || !kinds.includes(field.kind)) continue
    const value = resource.entry.values[candidate]
    if (typeof value === 'string' && value.trim().length > 0) return condense(value)
  }
  return undefined
}

function imageValue(image: SeoImage): JsonLdObject {
  return {
    '@type': 'ImageObject',
    url: image.url,
    width: image.width,
    height: image.height,
    caption: image.alt,
  }
}

function referenceValue(reference: SeoReference): JsonLdObject {
  return {
    '@type': reference.type ?? 'Thing',
    name: reference.name,
    url: reference.url,
  }
}

function resolveMedia(value: unknown, resolvers: SeoResolvers | undefined): readonly SeoImage[] {
  const ids = (Array.isArray(value) ? value : [value]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  const resolve = resolvers?.media
  if (resolve === undefined) return []

  const images: SeoImage[] = []
  for (const id of ids) {
    const image = resolve(id)
    if (image !== null) images.push(image)
  }
  return images
}

function resolveReferences(
  value: unknown,
  target: string,
  resolvers: SeoResolvers | undefined,
): readonly SeoReference[] {
  const ids = (Array.isArray(value) ? value : [value]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  const resolve = resolvers?.reference
  if (resolve === undefined) return []

  const references: SeoReference[] = []
  for (const id of ids) {
    const reference = resolve(target, id)
    if (reference !== null) references.push(reference)
  }
  return references
}

/**
 * The property a relation field maps to.
 *
 * Only the three relations a CMS reliably has are mapped. A relation to
 * `relatedProducts` has no defensible schema.org property, and inventing one
 * produces a graph that says something the site does not mean.
 */
function relationProperty(fieldName: string, target: string): string | null {
  const name = normaliseName(fieldName)
  const to = normaliseName(target)
  if (name === 'author' || name === 'authors' || to === 'author' || to === 'person') return 'author'
  if (name === 'tags' || name === 'keywords' || to === 'tag') return 'keywords'
  if (name === 'category' || name === 'categories' || to === 'category') return 'articleSection'
  return null
}

function dateProperty(fieldName: string): string | null {
  const name = normaliseName(fieldName)
  if (name === 'publishedat' || name === 'publishdate' || name === 'date') return 'datePublished'
  if (name === 'updatedat' || name === 'modifiedat') return 'dateModified'
  if (name === 'expiresat' || name === 'expirydate') return 'expires'
  if (name === 'startsat' || name === 'startdate') return 'startDate'
  if (name === 'endsat' || name === 'enddate') return 'endDate'
  return null
}

const DEFAULT_MAX_BODY = 5_000

/**
 * The JSON-LD object for one entry.
 *
 * `null` when the entry has no URL: structured data without a stable `@id` is
 * an orphan node no crawler can attach to a page.
 */
export function buildJsonLd(
  site: SeoSite,
  resource: SeoResource,
  options: JsonLdOptions = {},
): JsonLdObject | null {
  const url = canonicalUrl(site, resource)
  if (url === null) return null

  const { collection, entry } = resource
  const type = schemaTypeFor(collection, options)
  const resolvers = options.resolvers
  const graph: Record<string, JsonLdValue | undefined> = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': url,
    url,
    inLanguage: entry.locale,
  }

  const name = firstStringValue(resource, NAME_FIELDS, ['text', 'slug'])
  if (name !== undefined) {
    // `headline` is the article-family property; everything else uses `name`.
    // Google truncates `headline` past 110 characters, so both are emitted for
    // an article: the short one for the rich result, the full one for the graph.
    if (ARTICLE_TYPES.has(type)) {
      graph.headline = name.length > 110 ? `${name.slice(0, 107).trimEnd()}…` : name
      graph.name = name
    } else {
      graph.name = name
    }
  }

  const description = firstStringValue(resource, DESCRIPTION_FIELDS, ['text', 'richText'])
  if (description !== undefined) graph.description = description

  const images: SeoImage[] = []
  const authors: SeoReference[] = []
  const keywords: string[] = []
  const sections: string[] = []

  for (const [fieldName, field] of fieldsOf(collection)) {
    const value = entry.values[fieldName]
    if (value === undefined || value === null) continue

    switch (field.kind) {
      case 'media': {
        images.push(...resolveMedia(value, resolvers))
        break
      }
      case 'relation': {
        const target = typeof field.options.to === 'string' ? field.options.to : fieldName
        const property = relationProperty(fieldName, target)
        if (property === null) break
        const references = resolveReferences(value, target, resolvers)
        if (property === 'author') authors.push(...references)
        if (property === 'keywords') keywords.push(...references.map((one) => one.name))
        if (property === 'articleSection') sections.push(...references.map((one) => one.name))
        break
      }
      case 'date':
      case 'datetime': {
        const property = dateProperty(fieldName)
        if (property !== null && typeof value === 'string') graph[property] = value
        break
      }
      case 'richText': {
        if (!ARTICLE_TYPES.has(type)) break
        const body = extractRichText(value)
        if (body.length === 0) break
        const limit = options.maxBodyLength ?? DEFAULT_MAX_BODY
        graph.articleBody = body.length > limit ? body.slice(0, limit).trimEnd() : body
        break
      }
      case 'geo': {
        if (!isGeoPoint(value)) break
        graph.geo = { '@type': 'GeoCoordinates', latitude: value.lat, longitude: value.lng }
        break
      }
      default:
        break
    }
  }

  if (images.length > 0) {
    graph.image = images.length === 1 ? imageValue(images[0] as SeoImage) : images.map(imageValue)
  }
  if (authors.length > 0) {
    graph.author =
      authors.length === 1
        ? referenceValue({ type: 'Person', ...(authors[0] as SeoReference) })
        : authors.map((one) => referenceValue({ type: 'Person', ...one }))
  }
  if (keywords.length > 0) graph.keywords = keywords.join(', ')
  if (sections.length > 0) graph.articleSection = sections[0] as string

  // The system fields are authoritative for dates: a collection may have no
  // `publishedAt` of its own, and every entry has these two (contract A).
  if (graph.datePublished === undefined && entry.publishedAt !== null) {
    graph.datePublished = entry.publishedAt
  }
  if (graph.dateModified === undefined) graph.dateModified = entry.updatedAt

  if (options.publisher !== undefined) {
    graph.publisher = referenceValue({ type: 'Organization', ...options.publisher })
  }

  return stripUndefined(graph)
}

function isGeoPoint(value: unknown): value is { lat: number; lng: number } {
  if (typeof value !== 'object' || value === null) return false
  const point = value as Record<string, unknown>
  return typeof point.lat === 'number' && typeof point.lng === 'number'
}

/** `undefined` is not JSON. Dropping keys here keeps every call site free of guards. */
function stripUndefined(value: Record<string, JsonLdValue | undefined>): JsonLdObject {
  const cleaned: Record<string, JsonLdValue> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue
    cleaned[key] = typeof entry === 'object' && entry !== null ? stripDeep(entry) : entry
  }
  return cleaned
}

function stripDeep(value: JsonLdValue): JsonLdValue {
  if (Array.isArray(value)) return value.map(stripDeep)
  if (typeof value === 'object' && value !== null) {
    return stripUndefined(value as Record<string, JsonLdValue | undefined>)
  }
  return value
}

/**
 * JSON-LD ready to sit inside a `<script type="application/ld+json">`.
 *
 * `<`, `>` and `&` are written as `\u00XX` escapes. This is not decoration: a
 * value containing the literal text `</script>` closes the tag early, and the
 * remainder of the JSON becomes markup in the document. Inside a script
 * element, HTML entity escaping does *not* apply — the only escape the parser
 * respects is the JSON one, so it has to happen here. U+2028 and U+2029 are
 * escaped for the same reason on the JavaScript side.
 */
export function renderJsonLdScript(graph: JsonLdObject | readonly JsonLdObject[]): string {
  return JSON.stringify(graph)
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}
