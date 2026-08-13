/**
 * `@cogenta/seo` — the SEO floor every Cogenta site stands on (L3, task 14).
 *
 * Sitemaps, `robots.txt`, JSON-LD, Open Graph and Twitter Card, RSS and Atom,
 * `hreflang`, canonicals, `llms.txt` and IndexNow. Two properties hold across
 * all of them, and they are the reason the package exists as one unit rather
 * than as helpers scattered through the theme:
 *
 * 1. **Nothing unpublished ever leaves.** One gate (`isIndexable`), asked by
 *    every generator, so no output can forget.
 * 2. **Every document is escaped by construction.** No caller ever concatenates
 *    XML, so no title can invalidate a feed.
 *
 * The package holds no state, opens no socket except the explicit IndexNow
 * ping, and never touches the database — it is safe inside the render sandbox
 * (rule R5).
 */

export type { FeedInput, FeedItem, FeedItemsOptions } from './feeds.js'
export { feedItemsFor, renderAtomFeed, renderRssFeed, toRfc822 } from './feeds.js'
export type { HreflangAlternate, TranslationFamily } from './hreflang.js'
export { alternatesFor, buildHreflangMap, groupTranslationFamilies } from './hreflang.js'
export type { IndexableOptions } from './indexable.js'
export { indexableResources, isIndexable, isPublished } from './indexable.js'
export type { IndexNowFetch, IndexNowOptions, IndexNowResult } from './indexnow.js'
export { INDEXNOW_MAX_URLS, indexNowKeyFile, pingIndexNow } from './indexnow.js'
export type { JsonLdObject, JsonLdOptions, JsonLdValue } from './json-ld.js'
export { buildJsonLd, renderJsonLdScript, schemaTypeFor } from './json-ld.js'
export type {
  LlmsTxtLink,
  LlmsTxtOptions,
  LlmsTxtSection,
  LlmsTxtSectionsOptions,
} from './llms-txt.js'
export { llmsTxtSectionsFor, renderLlmsTxt } from './llms-txt.js'
export type { MetadataOptions, MetaTag } from './metadata.js'
export {
  buildMetaTags,
  escapeHtmlAttribute,
  escapeHtmlText,
  renderMetaTags,
} from './metadata.js'
export type { RobotsGroup, RobotsOptions } from './robots.js'
export { renderRobotsTxt } from './robots.js'
export type { ChangeFrequency, SitemapFile, SitemapOptions, SitemapUrl } from './sitemap.js'
export {
  buildSitemap,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_URLS,
  sitemapUrlsFor,
} from './sitemap.js'
export type { SeoImage, SeoReference, SeoResolvers, SeoResource, SeoSite } from './types.js'
export { absoluteUrl, canonicalUrl, hasRoute, normaliseBaseUrl, routeParams } from './url.js'
export type { XmlAttributes, XmlElement } from './xml.js'
export {
  escapeXmlAttribute,
  escapeXmlText,
  renderXmlDocument,
  renderXmlElement,
  stripIllegalXmlChars,
} from './xml.js'
