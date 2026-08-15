import { type AccessContext, ANONYMOUS, type ContentGateway } from '@cogenta/api'
import { isCogentaError } from '@cogenta/core'
import type { CollectionDefinition, ContentEntry } from '@cogenta/schema'
import {
  alternatesFor,
  buildJsonLd,
  buildMetaTags,
  buildSitemap,
  groupTranslationFamilies,
  type HreflangAlternate,
  renderJsonLdScript,
  renderMetaTags,
  renderRobotsTxt,
  type SeoImage,
  type SeoResource,
  type SeoSite,
  type SitemapFile,
  sitemapUrlsFor,
} from '@cogenta/seo'

/**
 * `@cogenta/seo`, actually wired to the server (L10, tasks 1-2).
 *
 * The package was written and tested against values, never against a running
 * `cogenta serve` — the lot names that gap explicitly. This module is the one
 * place the two meet: it converts what `serve.ts` holds (a `ContentGateway`,
 * a `CollectionDefinition`, a `ContentEntry`) into what `@cogenta/seo` takes
 * (`SeoSite`, `SeoResource`) and nothing else. No SEO decision is re-made
 * here — every tag, every URL and every published/not-published judgement is
 * still the package's own.
 */

export interface SiteIdentity {
  readonly name: string
  readonly url: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

/**
 * The site as the SEO layer sees it.
 *
 * `unprefixedDefaultLocale` is `true` because that is what this server
 * actually does: `createRequestListener` hands `matchPath` a `defaultLocale`,
 * and `matchPath` then resolves `/blog/hello` as well as `/en/blog/hello`.
 * Saying otherwise would emit canonicals that redirect to themselves — the
 * exact failure `SeoSite`'s own doc comment warns about.
 */
export function seoSiteFor(site: SiteIdentity): SeoSite {
  return {
    baseUrl: site.url,
    name: site.name,
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    unprefixedDefaultLocale: true,
  }
}

/** How many entries one collection contributes to a sitemap before it is cut off. */
const MAX_SITEMAP_ENTRIES_PER_COLLECTION = 5_000

/** Page size used to walk a collection. The gateway's own ceiling is 100. */
const SCAN_PAGE = 100

/**
 * Every published entry of every routed collection, as SEO resources.
 *
 * Read as `ANONYMOUS` on purpose, whoever asked for the sitemap: a sitemap is
 * a public document, and building it from the requesting actor's permissions
 * would give a signed-in editor a different — larger — sitemap than the one a
 * crawler fetches. `indexableResources` filters the unpublished half again on
 * its way out, so the guarantee is doubled rather than trusted once.
 */
export async function collectRoutedResources(
  collections: readonly CollectionDefinition[],
  gateway: ContentGateway,
): Promise<readonly SeoResource[]> {
  const context: AccessContext = { actor: ANONYMOUS }
  const resources: SeoResource[] = []

  for (const collection of collections) {
    if (collection.routing === undefined) continue

    // A routed collection the `public` role may not read at all makes the
    // gateway *throw* `FORBIDDEN` rather than answer an empty page. Skipping
    // it is the right answer — such a collection has no public URLs to list —
    // and catching is what keeps one login-only section from turning
    // `/sitemap.xml` into a 500 for every crawler. Found by the security
    // review of L10 task 2.
    try {
      let cursor: string | undefined
      let read = 0
      for (;;) {
        const page = await gateway.list(
          {
            collection: collection.name,
            limit: SCAN_PAGE,
            ...(cursor === undefined ? {} : { after: cursor }),
          },
          context,
        )
        for (const entry of page.items) resources.push({ collection, entry })
        read += page.items.length

        const next = page.nextCursor
        if (next === null || read >= MAX_SITEMAP_ENTRIES_PER_COLLECTION) break
        cursor = next
      }
    } catch (error) {
      if (isCogentaError(error) && error.code === 'FORBIDDEN') continue
      throw error
    }
  }

  return resources
}

/**
 * The `hreflang` alternates for one entry, or an empty list.
 *
 * Skipped outright on a single-locale site: `alternatesFor` would return
 * nothing anyway, and the family lookup is a filtered scan of the collection —
 * work every page render on a monolingual site would pay for a guaranteed
 * empty answer.
 *
 * The family is read through the same permission-checked gateway as the page
 * itself, with the same actor, so a translation the caller may not see never
 * becomes an alternate.
 */
export async function alternatesForEntry(
  site: SeoSite,
  collection: CollectionDefinition,
  entry: ContentEntry,
  gateway: ContentGateway,
  context: AccessContext,
  locales: readonly string[],
): Promise<readonly HreflangAlternate[]> {
  if (locales.length < 2) return []

  const sourceId = entry.translationOf ?? entry.id
  const page = await gateway.list(
    {
      collection: collection.name,
      filter: {
        or: [
          { field: 'id', operator: 'eq', value: sourceId },
          { field: 'translationOf', operator: 'eq', value: sourceId },
        ],
      },
      limit: SCAN_PAGE,
    },
    context,
  )

  const resources = page.items.map((found) => ({ collection, entry: found }))
  const family = groupTranslationFamilies(site, resources).find(
    (candidate) => candidate.sourceId === sourceId,
  )
  // A family of one is not a family: a self-referencing `hreflang` is noise,
  // and `buildHreflangMap` drops it for the same reason.
  if (family === undefined || family.members.length < 2) return []
  return alternatesFor(site, family)
}

export interface HeadOptions {
  readonly alternates?: readonly HreflangAlternate[]
  /** Resolves a media id to something a crawler can use. Absent means no social image. */
  readonly media?: (id: string) => SeoImage | null
  /** Forces `noindex` — a search results page, a preview. */
  readonly noindex?: boolean
  /** Overrides the derived title. Used for pages that are not one entry. */
  readonly title?: string
}

/**
 * The whole `<head>` an entry earns: title, description, canonical,
 * `hreflang`, Open Graph, Twitter Card and a JSON-LD block.
 *
 * Returned as one HTML string because that is what the page template needs;
 * every escaping decision inside it belongs to `@cogenta/seo` (`renderMetaTags`
 * for attributes, `renderJsonLdScript` for the `</script>` hazard), never to
 * this file.
 */
export function renderSeoHead(
  site: SeoSite,
  resource: SeoResource,
  options: HeadOptions = {},
): string {
  const tags = buildMetaTags(site, resource, {
    ...(options.alternates === undefined ? {} : { alternates: options.alternates }),
    ...(options.media === undefined ? {} : { resolvers: { media: options.media } }),
    ...(options.noindex === undefined ? {} : { noindex: options.noindex }),
    ...(options.title === undefined ? {} : { title: options.title }),
  })

  const parts = [renderMetaTags(tags)]

  const graph = buildJsonLd(site, resource, {
    ...(options.media === undefined ? {} : { resolvers: { media: options.media } }),
  })
  if (graph !== null && options.noindex !== true) {
    parts.push(`<script type="application/ld+json">${renderJsonLdScript(graph)}</script>`)
  }

  return parts.join('\n')
}

/**
 * The sitemap files a site needs — one below the protocol limits, an index
 * plus chunks above them.
 *
 * Returned as the whole set rather than one document because the split is not
 * this layer's decision to hide: `serve.ts` routes `/sitemap.xml` *and*
 * `/sitemap-N.xml` from the same array, so a site that grows past 50 000 URLs
 * starts serving an index without anybody changing a route.
 */
export function buildSitemapFiles(
  site: SeoSite,
  resources: readonly SeoResource[],
): readonly SitemapFile[] {
  return buildSitemap(site, sitemapUrlsFor(site, resources))
}

export interface RobotsRenderOptions {
  /** False on a staging or preview host: blocks every crawler outright. */
  readonly allowIndexing?: boolean
}

export function renderRobots(site: SeoSite, options: RobotsRenderOptions = {}): string {
  return renderRobotsTxt({
    site,
    sitemaps: ['/sitemap.xml'],
    // The admin is a signed-in application, not content. Nothing there is
    // reachable without a session anyway, but a crawler has no reason to
    // spend requests discovering that.
    groups: [{ userAgent: '*', allow: ['/'], disallow: ['/admin', '/api/'] }],
    ...(options.allowIndexing === undefined ? {} : { allowIndexing: options.allowIndexing }),
  })
}
