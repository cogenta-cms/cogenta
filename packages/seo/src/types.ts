import type { CollectionDefinition, ContentEntry } from '@cogenta/schema'

/**
 * What the SEO layer needs to know about the site.
 *
 * Deliberately not the whole site configuration: this package is consumed by
 * the render process, which owns neither secrets nor a database connection
 * (rule R5). Everything here is public information that already appears in the
 * page source.
 */
export interface SeoSite {
  /** Absolute origin, with or without a path prefix. `https://example.com`. */
  readonly baseUrl: string
  /** The site name, used in `og:site_name` and as the feed title. */
  readonly name: string
  readonly description?: string
  /** The language a URL carries when it has no locale prefix. */
  readonly defaultLocale: string
  /** Every language the site serves. Used to validate what a family claims. */
  readonly locales?: readonly string[]
  /**
   * Whether the default locale is served without its prefix — `/blog/hello`
   * next to `/fr/blog/bonjour`.
   *
   * It has to be stated rather than guessed: `buildPath` always prefixes a
   * localised route, while `matchPath` accepts both forms, so only the site
   * knows which of the two a crawler will find. Guessing produces canonical
   * URLs that 301 to themselves.
   */
  readonly unprefixedDefaultLocale?: boolean
  /** `@handle` for `twitter:site`. */
  readonly twitterSite?: string
}

/** An entry together with the collection that describes it. */
export interface SeoResource<TEntry extends ContentEntry = ContentEntry> {
  readonly collection: CollectionDefinition
  readonly entry: TEntry
}

export interface SeoImage {
  readonly url: string
  readonly width?: number
  readonly height?: number
  readonly alt?: string
  readonly mimeType?: string
}

/** A related entity — an author, a tag — reduced to what a crawler can use. */
export interface SeoReference {
  readonly name: string
  readonly url?: string
  /** schema.org type, when the caller knows it. `Person` for an author. */
  readonly type?: string
}

/**
 * How to turn an identifier into something publishable.
 *
 * A `media` field stores a media id and a `relation` field stores an entry id;
 * neither is meaningful to a crawler. Resolution needs the media pipeline and
 * the content store, which this package must not reach, so it is injected.
 *
 * Both are optional, and an unresolved id is **omitted** rather than emitted
 * raw: `"image": "0192f3a1-…"` is worse than no image at all, because it makes
 * structured data invalid rather than incomplete.
 */
export interface SeoResolvers {
  readonly media?: (id: string) => SeoImage | null
  readonly reference?: (collection: string, id: string) => SeoReference | null
}
