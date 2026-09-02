import { type AccessContext, ANONYMOUS, type ContentGateway } from '@cogenta/api'
import { isCogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentEntry,
  SITE_SETTINGS_SITE_SCOPE,
  type SiteSettingsStore,
} from '@cogenta/schema'
import {
  absoluteUrl,
  alternatesFor,
  buildJsonLd,
  buildMetaTags,
  buildSitemap,
  type ChangeFrequency,
  escapeHtmlAttribute,
  groupTranslationFamilies,
  type HreflangAlternate,
  renderJsonLdScript,
  renderMetaTags,
  renderRobotsTxt,
  type SeoImage,
  type SeoResource,
  type SeoSite,
  type SitemapCollectionOverride,
  type SitemapFile,
  type SitemapUrl,
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
 * The live-editable half of `@cogenta/seo`'s output (fiche 21 task 3): what
 * an admin set on the merged SEO screen's Général/Sitemap/Réseaux sociaux
 * tabs, read straight from `@cogenta/schema`'s `seo.*` site settings — never
 * cached at server startup, the same "read fresh on every request" contract
 * `ThemeRenderOptions.homePath` already uses. Every field is the empty/absent
 * state when nobody has set anything, so a site that never opens this screen
 * renders exactly as it did before this fiche.
 */
export interface SeoRenderDefaults {
  readonly titleTemplate: string
  readonly collectionTitleTemplates: Readonly<Record<string, string>>
  readonly defaultMetaDescription: string
  readonly twitterHandle: string
  readonly defaultSocialImageUrl: string
  readonly sitemapCollectionSettings: Readonly<Record<string, SitemapCollectionOverride>>
  /**
   * Fiche 50 task 2 — rendered into `<meta name="google-site-verification">`
   * by `siteVerificationMetaTags` below. Empty means the tag is omitted
   * entirely. Already forced to `''` by `readSeoRenderDefaults` when the
   * fiche 70 task 3 gate (`seo.searchVerificationEnabled`) is off — every
   * consumer of this field sees the gated value, never the raw setting, so
   * there is exactly one place this decision is made.
   */
  readonly googleSiteVerification: string
  /** Same shape, rendered into `<meta name="msvalidate.01">` — Bing Webmaster Tools' own meta-tag verification. Same gating as `googleSiteVerification`. */
  readonly bingSiteVerification: string
  /**
   * Fiche 50 task 4 — an admin's own robots.txt lines, merged in by
   * `renderRobots` below. Already forced to `''` by `readSeoRenderDefaults`
   * when `seo.robotsCustomRulesEnabled` (fiche 70 task 3) is off — the saved
   * text is never lost, only its effect on the served document.
   */
  readonly robotsCustomRules: string
}

/**
 * The site as the SEO layer sees it.
 *
 * `unprefixedDefaultLocale` is `true` because that is what this server
 * actually does: `createRequestListener` hands `matchPath` a `defaultLocale`,
 * and `matchPath` then resolves `/blog/hello` as well as `/en/blog/hello`.
 * Saying otherwise would emit canonicals that redirect to themselves — the
 * exact failure `SeoSite`'s own doc comment warns about.
 *
 * `seo` is optional and, when present, only ever *adds* to what the bare
 * `SiteIdentity` already says: an empty `defaultMetaDescription`/
 * `twitterHandle` is left out entirely rather than passed as `''`, so a page
 * that supplies its own description or the Twitter Card's absence is never
 * overridden by a setting nobody actually set.
 */
export function seoSiteFor(site: SiteIdentity, seo?: SeoRenderDefaults | null): SeoSite {
  return {
    baseUrl: site.url,
    name: site.name,
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    unprefixedDefaultLocale: true,
    ...(seo?.defaultMetaDescription ? { description: seo.defaultMetaDescription } : {}),
    ...(seo?.twitterHandle ? { twitterSite: seo.twitterHandle } : {}),
  }
}

/** `seo.defaultSocialImageUrl`, resolved to an absolute URL a social crawler can fetch without a session. */
function fallbackImageFor(
  site: SeoSite,
  seo: SeoRenderDefaults | null | undefined,
): SeoImage | undefined {
  const url = seo?.defaultSocialImageUrl
  if (url === undefined || url === '') return undefined
  return { url: url.startsWith('http') ? url : absoluteUrl(site, url) }
}

const EMPTY_SEO_DEFAULTS: SeoRenderDefaults = {
  titleTemplate: '',
  collectionTitleTemplates: {},
  defaultMetaDescription: '',
  twitterHandle: '',
  defaultSocialImageUrl: '',
  sitemapCollectionSettings: {},
  googleSiteVerification: '',
  bingSiteVerification: '',
  robotsCustomRules: '',
}

/**
 * `<meta>` tags proving domain ownership to Google Search Console and Bing
 * Webmaster Tools (fiche 50 task 2) — the meta-tag verification method both
 * offer as an alternative to DNS/file verification, deliberately the only
 * one this codebase implements: no OAuth flow, no Search Console/Webmaster
 * API call, no second secret to hold (R1/R7). An admin pastes the token the
 * provider's own verification page already shows them; this only renders
 * it, HTML-escaped like every other attribute value `@cogenta/seo` emits.
 */
export function siteVerificationMetaTags(seo: SeoRenderDefaults | null | undefined): string {
  const tags: string[] = []
  if (seo?.googleSiteVerification) {
    tags.push(
      `<meta name="google-site-verification" content="${escapeHtmlAttribute(seo.googleSiteVerification)}" />`,
    )
  }
  if (seo?.bingSiteVerification) {
    tags.push(
      `<meta name="msvalidate.01" content="${escapeHtmlAttribute(seo.bingSiteVerification)}" />`,
    )
  }
  return tags.join('\n')
}

function stringSetting(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function recordSetting<T>(
  value: unknown,
  fallback: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, T>)
    : fallback
}

/**
 * `seo.sitemapCollectionSettings` is stored with `''` sentinels for "no
 * hint" (so an empty text/select input round-trips instead of becoming
 * `NaN`/`undefined`) — `@cogenta/seo`'s own `SitemapCollectionOverride`
 * has no such sentinel, so this is the one place the two shapes meet.
 */
function toSitemapOverrides(
  raw: Readonly<
    Record<
      string,
      { readonly included: boolean; readonly changefreq: string; readonly priority: number | '' }
    >
  >,
): Readonly<Record<string, SitemapCollectionOverride>> {
  const overrides: Record<string, SitemapCollectionOverride> = {}
  for (const [name, entry] of Object.entries(raw)) {
    overrides[name] = {
      included: entry.included,
      ...(entry.changefreq === '' ? {} : { changefreq: entry.changefreq as ChangeFrequency }),
      ...(entry.priority === '' ? {} : { priority: entry.priority }),
    }
  }
  return overrides
}

/**
 * The live `seo.*` site settings (fiche 21 task 3), read fresh — never
 * cached at server startup, the same contract `ThemeRenderOptions.homePath`
 * already keeps for `reading.homePath`. A key nobody has ever written comes
 * back as its registry default (an empty string, or `{}`), the same as the
 * settings store itself does for any other group.
 */
export async function readSeoRenderDefaults(store: SiteSettingsStore): Promise<SeoRenderDefaults> {
  const [
    titleTemplate,
    collectionTitleTemplates,
    defaultMetaDescription,
    sitemapCollectionSettings,
    twitterHandle,
    defaultSocialImageUrl,
    googleSiteVerification,
    bingSiteVerification,
    robotsCustomRules,
    searchVerificationEnabled,
    robotsCustomRulesEnabled,
  ] = await Promise.all([
    store.get('seo.titleTemplate', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.collectionTitleTemplates', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.defaultMetaDescription', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.sitemapCollectionSettings', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.twitterHandle', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.defaultSocialImageUrl', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.googleSiteVerification', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.bingSiteVerification', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.robotsCustomRules', SITE_SETTINGS_SITE_SCOPE),
    // Fiche 70 task 3's own two gates. Read here, applied below, so every
    // consumer of `SeoRenderDefaults` — `theme-render.ts`, `serve.ts`'s
    // `/robots.txt` route, `SeoDiagnostics` — sees the gated value without
    // having to know the gate exists (single source of truth, no duplicate
    // check anywhere downstream).
    store.get('seo.searchVerificationEnabled', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.robotsCustomRulesEnabled', SITE_SETTINGS_SITE_SCOPE),
  ])

  // Both gates default to `true` (the registry's own default) — an install
  // that has never touched this setting keeps behaving exactly as it did
  // before this fiche.
  const verificationEnabled = searchVerificationEnabled?.value !== false
  const customRulesEnabled = robotsCustomRulesEnabled?.value !== false

  return {
    titleTemplate: stringSetting(titleTemplate?.value, EMPTY_SEO_DEFAULTS.titleTemplate),
    collectionTitleTemplates: recordSetting(
      collectionTitleTemplates?.value,
      EMPTY_SEO_DEFAULTS.collectionTitleTemplates,
    ),
    defaultMetaDescription: stringSetting(
      defaultMetaDescription?.value,
      EMPTY_SEO_DEFAULTS.defaultMetaDescription,
    ),
    twitterHandle: stringSetting(twitterHandle?.value, EMPTY_SEO_DEFAULTS.twitterHandle),
    defaultSocialImageUrl: stringSetting(
      defaultSocialImageUrl?.value,
      EMPTY_SEO_DEFAULTS.defaultSocialImageUrl,
    ),
    sitemapCollectionSettings: toSitemapOverrides(
      recordSetting(sitemapCollectionSettings?.value, {}),
    ),
    googleSiteVerification: verificationEnabled
      ? stringSetting(googleSiteVerification?.value, EMPTY_SEO_DEFAULTS.googleSiteVerification)
      : '',
    bingSiteVerification: verificationEnabled
      ? stringSetting(bingSiteVerification?.value, EMPTY_SEO_DEFAULTS.bingSiteVerification)
      : '',
    robotsCustomRules: customRulesEnabled
      ? stringSetting(robotsCustomRules?.value, EMPTY_SEO_DEFAULTS.robotsCustomRules)
      : '',
  }
}

/**
 * The three off-by-default indexing extras (fiche 50 tasks 3 and 5) —
 * separate from `SeoRenderDefaults` above because none of the three feeds a
 * page's `<head>`: IndexNow is pinged from the content-write path, and
 * `llms.txt` is a route toggle, not a per-page render decision.
 */
export interface SeoOperationalSettings {
  readonly indexNowEnabled: boolean
  readonly indexNowKey: string
  readonly llmsTxtEnabled: boolean
}

const EMPTY_SEO_OPERATIONAL_SETTINGS: SeoOperationalSettings = {
  indexNowEnabled: false,
  indexNowKey: '',
  llmsTxtEnabled: false,
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Read fresh, same "no restart" contract as `readSeoRenderDefaults`. */
export async function readSeoOperationalSettings(
  store: SiteSettingsStore,
): Promise<SeoOperationalSettings> {
  const [indexNowEnabled, indexNowKey, llmsTxtEnabled] = await Promise.all([
    store.get('seo.indexNowEnabled', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.indexNowKey', SITE_SETTINGS_SITE_SCOPE),
    store.get('seo.llmsTxtEnabled', SITE_SETTINGS_SITE_SCOPE),
  ])

  return {
    indexNowEnabled: booleanSetting(
      indexNowEnabled?.value,
      EMPTY_SEO_OPERATIONAL_SETTINGS.indexNowEnabled,
    ),
    indexNowKey: stringSetting(indexNowKey?.value, EMPTY_SEO_OPERATIONAL_SETTINGS.indexNowKey),
    llmsTxtEnabled: booleanSetting(
      llmsTxtEnabled?.value,
      EMPTY_SEO_OPERATIONAL_SETTINGS.llmsTxtEnabled,
    ),
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
  /** The admin-editable title templates and default social image (fiche 21 task 3). Absent behaves exactly as before that fiche. */
  readonly seo?: SeoRenderDefaults | null
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
  const fallbackImage = fallbackImageFor(site, options.seo)
  const collectionTitleTemplates = options.seo?.collectionTitleTemplates

  const tags = buildMetaTags(site, resource, {
    ...(options.alternates === undefined ? {} : { alternates: options.alternates }),
    ...(options.media === undefined ? {} : { resolvers: { media: options.media } }),
    ...(options.noindex === undefined ? {} : { noindex: options.noindex }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.seo?.titleTemplate ? { titleTemplate: options.seo.titleTemplate } : {}),
    ...(collectionTitleTemplates !== undefined && Object.keys(collectionTitleTemplates).length > 0
      ? { collectionTitleTemplates }
      : {}),
    ...(fallbackImage === undefined ? {} : { fallbackImage }),
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
  collectionOverrides?: Readonly<Record<string, SitemapCollectionOverride>>,
  /**
   * URLs a crawler should know about that are not entries — today, the
   * taxonomy term archives (audit 2026-09-01, 04-taxonomies-menus.md T01).
   *
   * A separate parameter rather than a synthetic `SeoResource`, because a
   * term genuinely is not one: it has no `status`, no `publishedAt` and no
   * translation family, and faking those three to get it through
   * `indexableResources` would put a lie in the middle of the SEO pipeline
   * so that a URL could come out the other end. These arrive already
   * decided-upon and are appended verbatim.
   */
  extraUrls?: readonly SitemapUrl[],
): readonly SitemapFile[] {
  return buildSitemap(site, [
    ...sitemapUrlsFor(
      site,
      resources,
      collectionOverrides === undefined ? {} : { collectionOverrides },
    ),
    ...(extraUrls ?? []),
  ])
}

export interface RobotsRenderOptions {
  /** False on a staging or preview host: blocks every crawler outright. */
  readonly allowIndexing?: boolean
  /** An admin's own robots.txt lines (fiche 50 task 4), merged in by `renderRobotsTxt`. */
  readonly customRules?: string
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
    ...(options.customRules === undefined ? {} : { customRules: options.customRules }),
  })
}
