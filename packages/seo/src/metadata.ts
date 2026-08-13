import { condense } from '@cogenta/schema'
import type { HreflangAlternate } from './hreflang.js'
import type { IndexableOptions } from './indexable.js'
import { isPublished } from './indexable.js'
import { schemaTypeFor } from './json-ld.js'
import type { SeoImage, SeoResolvers, SeoResource, SeoSite } from './types.js'
import { canonicalUrl } from './url.js'

/**
 * The head of a page: canonical, `hreflang`, Open Graph, Twitter Card, robots.
 *
 * Tags are returned as data and rendered separately. The renderer is one
 * function of eight lines, so returning strings would have been shorter — but a
 * theme needs to *inspect* the tags to merge its own, an Astro integration
 * wants them as component props, and a test wants to assert on a tag rather
 * than on a substring of HTML. A string is the one shape none of the three can
 * use.
 */

export type MetaTag =
  | { readonly kind: 'meta'; readonly name: string; readonly content: string }
  | { readonly kind: 'property'; readonly property: string; readonly content: string }
  | {
      readonly kind: 'link'
      readonly rel: string
      readonly href: string
      readonly hreflang?: string
    }
  | { readonly kind: 'title'; readonly text: string }

export interface MetadataOptions extends IndexableOptions {
  readonly resolvers?: SeoResolvers
  /** The family's alternates, from `buildHreflangMap`. */
  readonly alternates?: readonly HreflangAlternate[]
  /** Overrides the derived title. */
  readonly title?: string
  readonly description?: string
  /** Overrides the derived social image. */
  readonly image?: SeoImage
  /**
   * Forces `noindex` even on a published entry — a tag archive page, a search
   * result page, a paginated tail.
   */
  readonly noindex?: boolean
  readonly types?: Readonly<Record<string, string>>
}

const TITLE_FIELDS = ['title', 'name', 'label', 'heading']
const DESCRIPTION_FIELDS = ['excerpt', 'description', 'summary', 'subtitle', 'teaser']

/** Google truncates a description near 160 characters; longer is wasted bytes. */
const MAX_DESCRIPTION = 160

function pickString(resource: SeoResource, candidates: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    if (resource.collection.fields[candidate] === undefined) continue
    const value = resource.entry.values[candidate]
    if (typeof value === 'string' && value.trim().length > 0) return condense(value)
  }
  return undefined
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  const cut = value.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function firstImage(
  resource: SeoResource,
  resolvers: SeoResolvers | undefined,
): SeoImage | undefined {
  const resolve = resolvers?.media
  if (resolve === undefined) return undefined

  for (const [name, field] of Object.entries(resource.collection.fields)) {
    if (field.kind !== 'media') continue
    const value = resource.entry.values[name]
    const id = Array.isArray(value) ? value[0] : value
    if (typeof id !== 'string' || id.length === 0) continue
    const image = resolve(id)
    if (image !== null) return image
  }
  return undefined
}

/**
 * Open Graph's `og:type` vocabulary is not schema.org's, and it is tiny:
 * `article`, `profile`, `website`, `book`, plus the music and video families.
 * Mapping through it rather than passing the schema.org type keeps Facebook and
 * LinkedIn from silently falling back to `website` on every page.
 */
function openGraphType(schemaType: string): string {
  if (schemaType.endsWith('Article') || schemaType === 'BlogPosting') return 'article'
  if (schemaType === 'Person') return 'profile'
  if (schemaType === 'Book') return 'book'
  if (schemaType === 'VideoObject') return 'video.other'
  return 'website'
}

export function buildMetaTags(
  site: SeoSite,
  resource: SeoResource,
  options: MetadataOptions = {},
): readonly MetaTag[] {
  const tags: MetaTag[] = []
  const url = canonicalUrl(site, resource)
  const schemaType = schemaTypeFor(resource.collection, {
    ...(options.types === undefined ? {} : { types: options.types }),
  })

  const title = options.title ?? pickString(resource, TITLE_FIELDS) ?? site.name
  const rawDescription =
    options.description ?? pickString(resource, DESCRIPTION_FIELDS) ?? site.description
  const description =
    rawDescription === undefined ? undefined : truncate(rawDescription, MAX_DESCRIPTION)
  const image = options.image ?? firstImage(resource, options.resolvers)

  tags.push({ kind: 'title', text: title })

  // The robots tag comes first among the meta tags because it is the one that
  // matters when it is wrong. An unpublished entry rendered through a preview
  // token must carry `noindex`: preview URLs leak — they get pasted into chats,
  // into tickets, and eventually into a crawler's referrer log.
  const indexable = options.noindex !== true && isPublished(resource.entry, options) && url !== null
  if (!indexable) {
    tags.push({ kind: 'meta', name: 'robots', content: 'noindex, nofollow' })
  }

  if (description !== undefined) {
    tags.push({ kind: 'meta', name: 'description', content: description })
  }

  if (url !== null && indexable) {
    tags.push({ kind: 'link', rel: 'canonical', href: url })
  }

  for (const alternate of options.alternates ?? []) {
    tags.push({
      kind: 'link',
      rel: 'alternate',
      href: alternate.href,
      hreflang: alternate.hreflang,
    })
  }

  // Open Graph.
  tags.push({ kind: 'property', property: 'og:type', content: openGraphType(schemaType) })
  tags.push({ kind: 'property', property: 'og:title', content: title })
  tags.push({ kind: 'property', property: 'og:site_name', content: site.name })
  tags.push({ kind: 'property', property: 'og:locale', content: resource.entry.locale })
  if (url !== null) tags.push({ kind: 'property', property: 'og:url', content: url })
  if (description !== undefined) {
    tags.push({ kind: 'property', property: 'og:description', content: description })
  }
  if (image !== undefined) {
    tags.push({ kind: 'property', property: 'og:image', content: image.url })
    if (image.width !== undefined) {
      tags.push({ kind: 'property', property: 'og:image:width', content: String(image.width) })
    }
    if (image.height !== undefined) {
      tags.push({ kind: 'property', property: 'og:image:height', content: String(image.height) })
    }
    if (image.alt !== undefined) {
      tags.push({ kind: 'property', property: 'og:image:alt', content: image.alt })
    }
  }

  // `og:locale:alternate` takes the *other* languages only — listing the page's
  // own locale there makes Facebook drop the whole set.
  for (const alternate of options.alternates ?? []) {
    if (alternate.hreflang === 'x-default') continue
    if (alternate.hreflang === resource.entry.locale) continue
    tags.push({ kind: 'property', property: 'og:locale:alternate', content: alternate.hreflang })
  }

  if (openGraphType(schemaType) === 'article') {
    if (resource.entry.publishedAt !== null) {
      tags.push({
        kind: 'property',
        property: 'article:published_time',
        content: resource.entry.publishedAt,
      })
    }
    tags.push({
      kind: 'property',
      property: 'article:modified_time',
      content: resource.entry.updatedAt,
    })
  }

  // Twitter Card. `summary_large_image` only when there is an image: the card
  // type is a promise, and an unfulfilled one renders as a broken frame.
  tags.push({
    kind: 'meta',
    name: 'twitter:card',
    content: image === undefined ? 'summary' : 'summary_large_image',
  })
  if (site.twitterSite !== undefined) {
    tags.push({ kind: 'meta', name: 'twitter:site', content: site.twitterSite })
  }
  tags.push({ kind: 'meta', name: 'twitter:title', content: title })
  if (description !== undefined) {
    tags.push({ kind: 'meta', name: 'twitter:description', content: description })
  }
  if (image !== undefined) {
    tags.push({ kind: 'meta', name: 'twitter:image', content: image.url })
    if (image.alt !== undefined) {
      tags.push({ kind: 'meta', name: 'twitter:image:alt', content: image.alt })
    }
  }

  return tags
}

const HTML_ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escaping for an HTML attribute value.
 *
 * Separate from the XML escaper because HTML has no `&apos;` — it is an XML
 * entity that HTML 4 parsers do not know — so the numeric reference is used
 * instead. The two look interchangeable and are not; sharing one function here
 * is how a feed ends up with `&#39;` and a page with `&apos;`, one of which is
 * wrong in each context.
 */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => HTML_ATTRIBUTE_ESCAPES[char] ?? char)
}

export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>]/gu, (char) => HTML_ATTRIBUTE_ESCAPES[char] ?? char)
}

function renderMetaTag(tag: MetaTag): string {
  switch (tag.kind) {
    case 'title':
      return `<title>${escapeHtmlText(tag.text)}</title>`
    case 'meta':
      return `<meta name="${escapeHtmlAttribute(tag.name)}" content="${escapeHtmlAttribute(tag.content)}" />`
    case 'property':
      return `<meta property="${escapeHtmlAttribute(tag.property)}" content="${escapeHtmlAttribute(tag.content)}" />`
    case 'link': {
      const hreflang =
        tag.hreflang === undefined ? '' : ` hreflang="${escapeHtmlAttribute(tag.hreflang)}"`
      return `<link rel="${escapeHtmlAttribute(tag.rel)}"${hreflang} href="${escapeHtmlAttribute(tag.href)}" />`
    }
  }
}

/** The tags as HTML, one per line, ready to drop into `<head>`. */
export function renderMetaTags(tags: readonly MetaTag[]): string {
  return tags.map(renderMetaTag).join('\n')
}
