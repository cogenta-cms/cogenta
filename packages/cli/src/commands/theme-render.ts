import {
  type AccessContext,
  type ContentGateway,
  collectDependencies,
  type Filter,
  type MenuRouter,
  type QueryRequest,
} from '@cogenta/api'
import type { BlockRegistry, RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError, isCogentaError } from '@cogenta/core'
import { describeMedia, type MediaAsset as RenderMediaAsset, renderSkin } from '@cogenta/render'
import {
  type BlockZones,
  buildPath,
  type CollectionDefinition,
  type ContentEntry,
  matchPath,
  relationsOf,
} from '@cogenta/schema'
import type { SeoImage } from '@cogenta/seo'
import {
  type ChromeBrand,
  type ChromeInput,
  type ChromeLink,
  type ChromeNavLink,
  buildCollectionListQuery as collectionListQuery,
  createThemeTranslator,
  entryExcerpt,
  entryImage,
  escapeAttribute,
  type FetchedEntries,
  type ImageOptions,
  type ImageSource,
  type LinkTargetInput,
  type MediaReference,
  type PageContent,
  type PageEntryMeta,
  type PageEntryTerm,
  type PublicComment,
  type RenderContext,
  renderCommentsSection,
  serialize,
  type ContentEntry as ThemeContentEntry,
  type Page as ThemePage,
  type QueryRequest as ThemeQueryRequest,
} from '@cogenta/theme-kit'
import { DEFAULT_LOGO_PATH } from './default-logo.js'
import type { SeoRenderDefaults } from './seo.js'
import { alternatesForEntry, renderSeoHead, seoSiteFor, siteVerificationMetaTags } from './seo.js'
import { minifyCss } from './theme-css.js'
import { DEFAULT_THEME_NAME, resolveTheme, type ThemeModule } from './theme-registry.js'

/**
 * The theme's own `ContentEntry`/`QueryRequest` (`theme-contract.ts`) are a
 * deliberately separate, minimal public contract — a theme never imports
 * `@cogenta/api`'s richer internal types (that boundary is the whole point
 * of ADR-0016). These two functions are the only place this file crosses it.
 */
function toThemeEntry(entry: ContentEntry, collection: string): ThemeContentEntry {
  return {
    id: entry.id,
    collection,
    locale: entry.locale,
    status: entry.status,
    ...entry.values,
  }
}

function toApiFilter(flat: Readonly<Record<string, unknown>> | undefined): Filter | undefined {
  if (flat === undefined) return undefined
  const conditions = Object.entries(flat).map(([field, value]) => ({
    field,
    operator: 'eq' as const,
    value,
  }))
  if (conditions.length === 0) return undefined
  return conditions.length === 1 ? conditions[0] : { and: conditions }
}

function toApiQueryRequest(request: ThemeQueryRequest): QueryRequest {
  const filter = toApiFilter(request.filter)
  return {
    collection: request.collection,
    ...(filter === undefined ? {} : { filter }),
    ...(request.sort === undefined ? {} : { sort: [request.sort] }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    ...(request.cursor === undefined ? {} : { after: request.cursor }),
  }
}

async function listAsTheme(
  gateway: ContentGateway,
  request: ThemeQueryRequest,
  context: AccessContext,
): Promise<ThemePage<ThemeContentEntry>> {
  const page = await gateway.list(toApiQueryRequest(request), context)
  return {
    items: page.items.map((entry) => toThemeEntry(entry, request.collection)),
    nextCursor: page.nextCursor,
  }
}

/**
 * Real HTML for a matched route — the piece the lot's own gap notes named
 * honestly ("`cogenta build`/`theme` not built yet"): until a real Astro site
 * exists (ADR-0008, contract D's actual intended delivery plane), `cogenta
 * serve` renders the one theme this codebase has, `@cogenta/theme-canonical`,
 * directly against the same permission-checked `ContentGateway` every REST
 * and GraphQL request already goes through. No secret, config or DB handle
 * ever reaches theme code — only the same `ContentEntry` shape a real HTTP
 * client would receive, so the data boundary R5 cares about holds even
 * in-process. This is a deliberately scoped stand-in, not the Astro pipeline:
 * one theme, no build step, no static generation.
 */

/** Where `cogenta serve` publishes image variants. Public: a visitor's browser fetches them. */
export const DEFAULT_IMAGE_ENDPOINT = '/_image'

export interface ThemeRenderOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly gateway: ContentGateway
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  /**
   * The whole stylesheet: the skin's generated `--cogenta-*` custom properties
   * followed by the theme's own sheet, already flattened and minified (see
   * `theme-css.ts`). `null` when neither could be loaded — served unstyled
   * rather than refused.
   *
   * The sheet is *linked*, not inlined: only the presence of one is needed
   * here, so that a site with no stylesheet emits no dead `<link>`.
   */
  readonly styles: string | null
  /**
   * Loads the media a render references, in one batch, before rendering.
   *
   * It has to be a batch: `renderBlock` is pure and synchronous (contract D),
   * and `@cogenta/seo`'s `SeoResolvers.media` is synchronous too, so neither
   * `ctx.image()` nor an `og:image` can await a lookup. Which ids a page
   * needs is answered by `collectDependencies` — the same walk `/api/content`
   * already uses to declare a response's media dependencies — rather than by
   * a fresh heuristic over block JSON.
   *
   * Absent means no images: `ctx.image()` refuses clearly, exactly as it did
   * before the pipeline existed.
   */
  readonly loadMedia?: (ids: readonly string[]) => Promise<ReadonlyMap<string, RenderMediaAsset>>
  /** Where image variants are served from. Defaults to `/_image`. */
  readonly imageEndpoint?: string
  /**
   * Self-hosted, cookie-free page-view analytics (`@cogenta/analytics`, L10
   * analytics gap). The `Referer` header of *this* request — the theme's own
   * `<script>`-free policy (see `serve.test.ts`, "no executable client
   * JavaScript anywhere on the page") rules out reading `document.referrer`
   * from an inline script, so the referrer this page was reached from is
   * read server-side, from the request that is rendering it, and baked
   * straight into a collection `<img>` pixel — no client code needed to
   * capture it (see `analyticsBeaconTag` below).
   *
   * Absent entirely means the beacon is left out of the page altogether.
   * Callers pass `{}` (no `referrer`) rather than leaving this out when there
   * is simply no `Referer` header to report — the page builder's draft
   * preview does that, since its request is a `POST` with no navigation
   * referrer of its own, and doing so keeps its `<body>` byte-identical to
   * the published page's (`serve-builder.test.ts`'s fidelity test) rather
   * than carving out an exception that would itself become a body difference.
   */
  readonly analyticsBeacon?: { readonly referrer?: string | undefined }
  /**
   * Wires `GET /api/menus/by-location/{location}` into the render pipeline
   * (audit follow-up to L13's menu system: the backend, API and admin were
   * complete and tested, but no menu ever reached the public theme). Called
   * in-process, through the very same `MenuRouter` `/api/menus/*` is mounted
   * with — never a second lookup path.
   *
   * Absent means no menu lookup at all — the same empty slots as before this
   * was wired.
   */
  readonly menuRouter?: MenuRouter
  /**
   * The `location` (fiche 09, task 3) whose assigned menu renders in the
   * page header. Defaults to `DEFAULT_HEADER_MENU_LOCATION`.
   *
   * This is the generic half of navigation resolution: a menu is looked up
   * by *where it is slotted*, never by a theme's own name for that slot.
   * `theme-render.ts` itself never hardcodes a vocabulary of locations — the
   * default here is this one stand-in theme's choice, not a rule this file
   * enforces, so a future second theme's own `assembleSite` wiring can pass
   * a different string (`'header-nav'`, say) through this option without
   * touching a line of render code or migrating any data.
   */
  readonly headerMenuLocation?: string
  /** The `location` whose assigned menu renders in the page footer. Defaults to `DEFAULT_FOOTER_MENU_LOCATION`. */
  readonly footerMenuLocation?: string
  /**
   * The block registry a stored block's type is resolved against before
   * `theme.renderPage` renders it — `@cogenta/blocks`'s shared vocabulary by
   * default. A site with blocks of its own (fiche 43, sous-chantier C(ii))
   * passes its own registry here, so that an active theme not implementing
   * one of them still renders its declared `fallback` rather than a silently
   * blank slot. No built-in theme declares one today; this is the wiring a
   * theme package (or a theme-shipping plugin) that does can rely on.
   */
  readonly blocks?: BlockRegistry
  /**
   * The path served at `/` (fiche 23 task 4) — a real, honest replacement
   * for the `/home` fallback this file used to hardcode.
   *
   * Read live, not cached at startup: the whole point of storing this in the
   * site settings database rather than the config file is "choisir une
   * autre page d'accueil depuis l'admin, sans redéployer" (fiche 23's own
   * acceptance test), so every request that resolves `/` asks again.
   *
   * Absent, or resolving to `null`/`''` (unset), falls back to the exact
   * pre-fiche-23 behaviour: retry `/`  as `/home`, the slug every blueprint
   * seeds its home page at.
   */
  readonly homePath?: () => Promise<string | null>
  /**
   * The admin-editable `seo.*` site settings (fiche 21 task 3) — title
   * templates, the default social image, and per-collection sitemap hints.
   * Read fresh on every request, like `homePath` above, for the same reason:
   * a title template an admin just saved must show up on the very next page
   * view. Absent means this fiche never ran — every page renders exactly as
   * it did before it.
   */
  readonly seo?: () => Promise<SeoRenderDefaults>
  /**
   * Fiche 35 task 6: a thin bar rendered for an authenticated visitor of the
   * *public* site, linking straight back into the admin. `false`/absent by
   * default — set only by `cogenta serve`'s plain page-GET dispatch, never
   * by the page builder's own preview render (`renderDraftPage`): the
   * builder's own fidelity test (`serve-builder.test.ts`) asserts its
   * `<body>` is byte-for-byte identical to the published page's, and an
   * authenticated preview carrying a bar the anonymous published fetch
   * never sees would be exactly the difference that test exists to catch.
   *
   * Still gated a second time, inside the renderer, on the actor actually
   * being authenticated (`context.actor.id !== null`) — an anonymous
   * visitor never sees it and the page never carries the extra markup for
   * one, whatever this flag says.
   */
  readonly adminBar?: boolean
  /**
   * The comment thread and its submission form (fiche 15 task 6, ADR-0025).
   * Rendered by `renderEntryPage` itself, after the page's own `<main>` —
   * both `renderRequestedPage` (published) and `renderDraftPage` (preview)
   * funnel through it, so the thread appears identically on both without a
   * special case: it reads the same live, already-approved comments either
   * way, which is exactly what keeps the L16 fidelity test's "byte for byte"
   * claim true rather than needing an exception for this feature too.
   *
   * Absent means no comments section is rendered at all — the pre-fiche-15
   * page, unchanged.
   */
  readonly comments?: {
    /** `POST` target for the form — `/api/comments` on a real server. */
    readonly action: string
    /** Must match `CommentsRouterOptions.honeypotField` on the server side. Defaults to `website` on both. */
    readonly honeypotField?: string
    readonly forEntry: (
      collection: string,
      entryId: string,
      locale: string | null,
    ) => Promise<{ readonly open: boolean; readonly items: readonly PublicComment[] }>
  }
  /**
   * Whether/how Cogenta's own credit shows in the public footer, and its
   * white-label override (fiche L21 task 8, ADR-0025's editorial settings).
   *
   * Read live per request, not cached at startup — the same reasoning as
   * `homePath` above: the whole point of storing this in the site settings
   * database is turning it off from the admin without a redeploy, so every
   * rendered page asks again.
   *
   * Absent means the pre-task-8 behaviour: full Cogenta credit, unconditionally.
   */
  readonly branding?: () => Promise<BrandingSettings>
  /**
   * The name of the theme *package* to render this page with (fiche L23) —
   * `@cogenta/theme-portfolio`, say. Read live per request, the same reasoning
   * `branding`/`homePath` give: switching a site's theme from the appearance
   * screen must show up on the very next page view, with no restart.
   *
   * Absent, or resolving to `null`, renders with `theme-registry.ts`'s
   * `DEFAULT_THEME_NAME` (`@cogenta/theme-canonical`) — the pre-fiche-L23
   * behaviour, unchanged for a site that has never touched this setting.
   */
  readonly activeTheme?: () => Promise<string | null>
  /**
   * The site's own visual identity, as the appearance screen's "Identité"
   * card already stores it: logo, dark-scheme logo, favicon, share image
   * (`ThemeOverridesState`, `@cogenta/schema`).
   *
   * Every one of those four settings was writable, saved, and read back by
   * the admin — and read by nothing else at all. This option is what finally
   * makes them reach a rendered page (audit 2026-09-01, §7 T01).
   *
   * Read live per request, the same reasoning `branding`/`homePath` give:
   * choosing a logo in the admin must show on the very next page view, with
   * no restart. Absent, or resolving to all-`null`, renders exactly as
   * before: the site name in text, and `DEFAULT_LOGO_PATH` as the favicon.
   */
  readonly identity?: () => Promise<SiteIdentityMedia>
  /**
   * `general.tagline`/`general.socialLinks`/`general.footerNote` (contract D
   * `theme@1.4`, L25 D2), read live per request like `identity`/`seo` above.
   * Absent renders exactly as a pre-1.4 site did: no tagline, no social
   * links, no footer note, on every theme.
   */
  readonly chromeExtras?: (locale: string) => Promise<ChromeExtras>
  /**
   * The display name of an entry's author (`entry.createdBy`, contract A),
   * for `PageContent.entry.author` (contract D `theme@1.4`). Absent means no
   * author ever reaches a page — the pre-1.4 behaviour, and the honest
   * answer for a caller with no user store wired at all (a bare test
   * harness, `renderThemeGalleryPreview`'s synthetic page).
   */
  readonly authorFor?: (userId: string) => Promise<{ readonly name: string } | null>
  /**
   * One taxonomy term, resolved to a label and a route — the same shape
   * `resolveMenuTerm` (`serve.ts`) already answers for a menu item pointing
   * at a term, reused here for `PageContent.entry.terms` (contract D
   * `theme@1.4`) rather than a second lookup. Absent means no entry ever
   * carries `terms` — the pre-1.4 behaviour.
   */
  readonly resolveTerm?: (
    taxonomyName: string,
    termId: string,
  ) => Promise<{ readonly label: string; readonly route: string | null } | null>
}

/**
 * The four media ids the appearance screen's identity card stores. Ids, not
 * URLs: resolving one to a URL means asking the media library whether it
 * still exists and whether it is an image at all, which is a decision this
 * renderer makes (through `loadMedia`), not one the settings row can carry.
 */
export interface SiteIdentityMedia {
  readonly logoMediaId: string | null
  readonly logoDarkMediaId: string | null
  readonly faviconMediaId: string | null
  /**
   * The default `og:image`. Deliberately *not* a second social-image
   * mechanism beside `seo.defaultSocialImageUrl`: see `resolveIdentity` for
   * which one wins and why.
   */
  readonly shareImageMediaId: string | null
}

/** "Nothing has ever been chosen" — the pre-T01 rendering, exactly. */
export const EMPTY_SITE_IDENTITY: SiteIdentityMedia = {
  logoMediaId: null,
  logoDarkMediaId: null,
  faviconMediaId: null,
  shareImageMediaId: null,
}

/** The site identity, resolved against the real media library — see `ThemeRenderOptions.identity`. */
interface ResolvedIdentity {
  readonly brand: ChromeBrand
  /** The chosen favicon's URL, or `null` for "nothing chosen" — `faviconLinkTag` decides what that falls back to. */
  readonly faviconHref: string | null
  /** The absolute-or-site-relative URL of the chosen share image, or `null`. */
  readonly shareImageUrl: string | null
}

/**
 * Resolves the four identity media ids into what a page actually needs.
 *
 * One batch through the very same `loadMedia` every other image on the page
 * goes through — never a second lookup path, and never a URL built from an
 * id this renderer has not confirmed is a live image: a `kind !== 'image'`
 * asset (a PDF someone picked in the media browser) resolves to `null` and
 * the site falls back, rather than emitting a `<link rel="icon">` pointing
 * at a document.
 *
 * **The share-image decision (audit T01, left open as "à trancher").**
 * `seo.defaultSocialImageUrl` stays the one field the SEO pipeline reads;
 * `shareImageMediaId` becomes a *source* for it, not a rival — when the
 * appearance screen names a media, its `/_image` URL is what
 * `fallbackImageFor` sees, and otherwise the SEO screen's URL is used
 * unchanged. Two screens, one effective value, and neither field is
 * silently dead: the appearance one wins because it is the more specific
 * choice (a picked asset beats a typed URL), and because dropping it would
 * throw away a setting sites have already saved.
 */
async function resolveIdentity(
  siteName: string,
  imageEndpoint: string,
  options: Pick<ThemeRenderOptions, 'identity' | 'loadMedia'>,
): Promise<ResolvedIdentity> {
  const identity = options.identity === undefined ? EMPTY_SITE_IDENTITY : await options.identity()
  const ids = [
    identity.logoMediaId,
    identity.logoDarkMediaId,
    identity.faviconMediaId,
    identity.shareImageMediaId,
  ].filter((id): id is string => id !== null && id !== '')

  const assets = new Map<string, RenderMediaAsset>()
  if (ids.length > 0 && options.loadMedia !== undefined) {
    for (const [id, asset] of await options.loadMedia([...new Set(ids)])) assets.set(id, asset)
  }

  const sourceFor = (id: string | null): ImageSource | null => {
    if (id === null || id === '') return null
    const asset = assets.get(id)
    if (asset === undefined || asset.kind !== 'image') return null
    return describeMedia(asset, {}, { endpoint: imageEndpoint, mediaEndpoint: imageEndpoint })
  }

  const favicon = sourceFor(identity.faviconMediaId)
  const share = sourceFor(identity.shareImageMediaId)
  return {
    brand: {
      name: siteName,
      logo: sourceFor(identity.logoMediaId),
      logoDark: sourceFor(identity.logoDarkMediaId),
      faviconUrl: favicon === null ? null : favicon.src,
    },
    faviconHref: favicon === null ? null : favicon.src,
    shareImageUrl: share === null ? null : share.src,
  }
}

/**
 * `<link rel="icon">`, and what it falls back to.
 *
 * The fallback is **branding-aware**, and that is not a detail: Cogenta's
 * default icon is Cogenta's own logo, so a site that turned the credit off
 * (fiche L21 task 8) and then got that logo back in its browser tab would
 * have its white-labelling undone by the very change that started serving a
 * favicon at all. A white-labelled site therefore falls back to its own
 * uploaded replacement logo, and to *no icon tag whatsoever* when it has
 * none — a browser's own blank default, which is the honest answer, not
 * somebody else's mark.
 *
 * The `type` is only ever declared for the default, which really is the PNG
 * this package ships; a media-library asset goes through `/_image`, which
 * answers WebP or PNG depending on what the upload pipeline wrote, so
 * declaring `image/png` there would be a claim this file cannot make. A
 * browser sniffs the bytes either way.
 */
function faviconLinkTag(
  chosen: string | null,
  branding: BrandingSettings,
  imageEndpoint: string,
): string {
  const href = chosen ?? defaultFaviconFor(branding, imageEndpoint)
  if (href === null) return ''
  const typeAttr = href === DEFAULT_LOGO_PATH ? ' type="image/png"' : ''
  return `<link rel="icon"${typeAttr} href="${escapeAttribute(href)}">`
}

function defaultFaviconFor(branding: BrandingSettings, imageEndpoint: string): string | null {
  if (branding.showCogentaBranding) return DEFAULT_LOGO_PATH
  if (branding.customLogoMediaId !== null && branding.customLogoMediaId !== '') {
    return `${imageEndpoint}?id=${encodeURIComponent(branding.customLogoMediaId)}&w=64`
  }
  return null
}

/**
 * Four of the five built-in themes pull their typefaces from Google Fonts
 * with a CSS `@import`, which the browser only discovers *after* the
 * stylesheet has downloaded and parsed — two extra round trips before the
 * first glyph is requested. `preconnect` collapses the DNS/TLS half of that
 * wait, and it is emitted unconditionally on purpose: the cost of two unused
 * hints on a system-font theme is a few dozen bytes, while making it
 * conditional would mean this file keeping a list of which themes use web
 * fonts — exactly the per-theme knowledge the chrome extension point exists
 * to keep out of here.
 *
 * `font-display: swap` itself is already declared by every one of those four
 * `@import` URLs (`&display=swap`), so no font blocks first paint today;
 * these hints are the remaining half of that fix.
 */
/**
 * The site's own feeds, discoverable (audit T03). A reader pasting the site's
 * URL into a feed reader finds them through these two tags and nothing else —
 * the routes existed before this and were invisible.
 *
 * Both formats are advertised because readers disagree about which they
 * prefer, and both are served from the same content, so offering one would
 * only make the other undiscoverable for no gain.
 */
function feedLinkTags(siteName: string): string {
  const title = escapeAttribute(siteName)
  return (
    `<link rel="alternate" type="application/rss+xml" title="${title}" href="/feed.xml">` +
    `<link rel="alternate" type="application/atom+xml" title="${title}" href="/atom.xml">`
  )
}

function fontPreconnectTags(): string {
  return (
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
  )
}

/** `branding.showCogentaBranding` / `branding.customLogoMediaId`, resolved (fiche L21 task 8). */
export interface BrandingSettings {
  readonly showCogentaBranding: boolean
  /** A media id, or `null` for "no white-label logo uploaded". */
  readonly customLogoMediaId: string | null
  /**
   * `@cogenta/core`'s own package version (fiche 22 tâche 8, part 4) — shown
   * next to Cogenta's credit in the public footer, but only ever when
   * `showCogentaBranding` is true: a white-labelled site has no reason to
   * advertise which CMS or which version runs it. Optional so a caller that
   * predates this field (or genuinely does not know the version) still gets
   * the pre-task-8 footer rather than a crash.
   */
  readonly cogentaVersion?: string
}

const DEFAULT_BRANDING: BrandingSettings = { showCogentaBranding: true, customLogoMediaId: null }

async function brandingFor(
  get: (() => Promise<BrandingSettings>) | undefined,
): Promise<BrandingSettings> {
  if (get === undefined) return DEFAULT_BRANDING
  return get()
}

/** Resolves the active theme module — `theme-registry.ts`'s own fallback covers an absent or unrecognised name. */
async function themeFor(get: (() => Promise<string | null>) | undefined): Promise<ThemeModule> {
  const name = get === undefined ? DEFAULT_THEME_NAME : await get()
  return resolveTheme(name)
}

/**
 * `general.tagline`/`general.socialLinks`/`general.footerNote` (contract D
 * `theme@1.4`, L25 D2), already resolved for one locale — what
 * `resolveChromeExtras` below folds into a `ChromeInput`.
 */
export interface ChromeExtras {
  readonly tagline: string
  readonly social: readonly ChromeLink[]
  readonly footerNote: string
}

const EMPTY_CHROME_EXTRAS: ChromeExtras = { tagline: '', social: [], footerNote: '' }

async function chromeExtrasFor(
  get: ((locale: string) => Promise<ChromeExtras>) | undefined,
  locale: string,
): Promise<ChromeExtras> {
  if (get === undefined) return EMPTY_CHROME_EXTRAS
  return get(locale)
}

/**
 * The `location` a menu is assigned to for it to become `ChromeInput.headerAction`
 * (contract D `theme@1.4`) — a site names its own menu at this location from
 * the admin's menu screen, exactly the way `header-nav`/`footer-nav` already
 * work for `headerNav`/`footerNav`.
 */
export const HEADER_ACTION_MENU_LOCATION = 'header-action'

/**
 * The first link of the menu assigned to `HEADER_ACTION_MENU_LOCATION`, or
 * `undefined` when no menu is assigned there (or it has no menu router
 * wired at all) — never a legacy-name fallback, unlike
 * `fetchMenuLinksForSlot`'s header/footer nav: this location is new in L25,
 * so there is no pre-existing convention it needs to keep working.
 */
async function resolveHeaderAction(
  locale: string,
  menus: { readonly menuRouter?: MenuRouter } | undefined,
  context: AccessContext,
): Promise<ChromeLink | undefined> {
  if (menus?.menuRouter === undefined) return undefined
  const links = await fetchMenuLinksByLocation(HEADER_ACTION_MENU_LOCATION, locale, menus, context)
  const first = links?.[0]
  if (first === undefined || first.href === null) return undefined
  return { label: first.label, href: first.href }
}

/**
 * The one place every `renderChrome` call resolves the four `theme@1.4`
 * fields (D2) from — `general.tagline`/`general.socialLinks`/
 * `general.footerNote` through whichever `chromeExtras` reader the caller
 * wired (`chromeExtrasForSite`, `@cogenta/cli`'s `serve.ts`), and
 * `headerAction` from the live menu router right here, since it needs no
 * database read of its own. Every field is omitted, never emitted as `''`/
 * `[]`, when it has nothing to say — a theme's own "is this set" check
 * (`input.tagline !== undefined`, say) stays a plain presence check.
 */
async function resolveChromeExtras(
  getExtras: ((locale: string) => Promise<ChromeExtras>) | undefined,
  locale: string,
  menus: { readonly menuRouter?: MenuRouter } | undefined,
  context: AccessContext,
): Promise<Pick<ChromeInput, 'tagline' | 'social' | 'footerNote' | 'headerAction'>> {
  const [extras, headerAction] = await Promise.all([
    chromeExtrasFor(getExtras, locale),
    resolveHeaderAction(locale, menus, context),
  ])
  return {
    ...(extras.tagline === '' ? {} : { tagline: extras.tagline }),
    ...(extras.social.length === 0 ? {} : { social: extras.social }),
    ...(extras.footerNote === '' ? {} : { footerNote: extras.footerNote }),
    ...(headerAction === undefined ? {} : { headerAction }),
  }
}

/**
 * The footer's own branding block — Cogenta's real logo and a link back to
 * the project by default, the site's uploaded replacement once Cogenta's
 * credit is turned off, or nothing at all once it is off with no
 * replacement. `imageEndpoint` is the same `/_image` (or override) every
 * other image on the page already resolves through — no second delivery
 * path for this one image.
 */
function renderFooterBranding(branding: BrandingSettings, imageEndpoint: string): string {
  if (branding.showCogentaBranding) {
    const versionSuffix =
      branding.cogentaVersion === undefined || branding.cogentaVersion === ''
        ? ''
        : ` <span class="cg-site-footer__version">v${escapeHtml(branding.cogentaVersion)}</span>`
    return (
      `<div class="cg-site-footer__branding">` +
      `<a href="https://github.com/cogenta-cms/cogenta" rel="noopener" target="_blank">` +
      `<img src="${DEFAULT_LOGO_PATH}" width="32" height="32" alt="Cogenta" ` +
      `class="cg-site-footer__brand-logo" loading="lazy">${versionSuffix}</a></div>`
    )
  }
  if (branding.customLogoMediaId !== null && branding.customLogoMediaId !== '') {
    const src = `${imageEndpoint}?id=${encodeURIComponent(branding.customLogoMediaId)}&w=64`
    return (
      `<div class="cg-site-footer__branding">` +
      `<img src="${escapeAttribute(src)}" width="32" height="32" alt="" ` +
      `class="cg-site-footer__brand-logo" loading="lazy"></div>`
    )
  }
  return ''
}

/** The hardcoded fallback every blueprint's home page uses when no `reading.homePath` setting is stored. */
const DEFAULT_HOME_PATH = '/home'

async function homePathFor(options: ThemeRenderOptions): Promise<string> {
  if (options.homePath === undefined) return DEFAULT_HOME_PATH
  const configured = await options.homePath()
  return configured === null || configured === '' ? DEFAULT_HOME_PATH : configured
}

/** This stand-in theme's own default header slot — see `ThemeRenderOptions.headerMenuLocation`. */
export const DEFAULT_HEADER_MENU_LOCATION = 'primary'
/** This stand-in theme's own default footer slot — see `ThemeRenderOptions.footerMenuLocation`. */
export const DEFAULT_FOOTER_MENU_LOCATION = 'footer'

/**
 * Where the served stylesheet lives. Under `/_cogenta/` for the same reason
 * `Base.astro` puts the skin there: it is a namespace no collection route can
 * ever claim, since every route pattern starts from a collection's own path.
 */
export const STYLESHEET_PATH = '/_cogenta/styles.css'

function fieldOfKind(collection: CollectionDefinition, kind: string): string | undefined {
  return Object.entries(collection.fields).find(([, field]) => field.kind === kind)?.[0]
}

function toVocabularyBlocks(
  entry: ContentEntry,
  collection: CollectionDefinition,
): VocabularyBlock[] {
  const blocksField = fieldOfKind(collection, 'blocks')
  if (blocksField !== undefined) {
    const zone = entry.blocks[blocksField] ?? []
    return zone.map(
      (block) =>
        ({
          _key: block.key,
          _type: block.type,
          _version: '1.0.0',
          ...block.data,
        }) as VocabularyBlock,
    )
  }

  // No blocks field: a collection like `post`, whose body is `richText`
  // rather than a block zone, gets its content wrapped in a single real
  // `prose` block — the exact portable-text shape prose already renders,
  // reused rather than a second serialiser for the same data.
  const richTextField = fieldOfKind(collection, 'richText')
  if (richTextField === undefined) return []
  return [
    {
      _key: 'body',
      _type: 'prose',
      _version: '1.0.0',
      body: entry.values[richTextField],
    } as VocabularyBlock,
  ]
}

interface RichTextAssets {
  /** Ids of every `media` node found inside a rich text document. */
  readonly media: readonly string[]
  /** `{collection, id}` of every `internalLink` mark definition found. */
  readonly links: readonly { readonly collection: string; readonly id: string }[]
}

function richTextRefs(document: RichTextDocument): RichTextAssets {
  const media = new Set<string>()
  const links: { collection: string; id: string }[] = []
  for (const node of document) {
    if (node._type === 'media') {
      media.add(node.id)
      continue
    }
    // A thematic break (fiche 42 task 2) carries no data beyond its key —
    // no `markDefs` to walk, unlike a text block.
    if (node._type === 'hr') continue
    for (const definition of node.markDefs) {
      if (definition._type === 'internalLink') {
        links.push({ collection: definition.collection, id: definition.id })
      }
    }
  }
  return { media: [...media], links }
}

/**
 * The `media` nodes and `internalLink` marks a page's rich text carries
 * (ADR-0013), gathered up front for the same reason `collectionList`'s
 * entries are: `renderBlock` is pure and synchronous (contract D), so
 * `ctx.image()` and `link()` cannot await a lookup once rendering starts.
 *
 * `@cogenta/api`'s `collectDependencies` does not reach inside a `richText`
 * value — it only walks a collection's own declared `media`/`relation`
 * fields — so a media node or an internal link living *inside* prose would
 * otherwise never be fetched, and `ctx.image()` would throw on a perfectly
 * valid page. Only `prose` carries a top-level `richText` field in contract
 * B's vocabulary (`body`); a `faq` answer is also rich text, but nested
 * inside a repeated item the same way gallery/logo media is, which
 * `collectDependencies` already treats as a known, separate limitation.
 */
function collectRichTextAssets(blocks: readonly VocabularyBlock[]): RichTextAssets {
  const media = new Set<string>()
  const links: { collection: string; id: string }[] = []
  for (const block of blocks) {
    if (block._type !== 'prose') continue
    const refs = richTextRefs(block.body)
    for (const id of refs.media) media.add(id)
    links.push(...refs.links)
  }
  return { media: [...media], links }
}

export function entryTitle(entry: ContentEntry): string {
  const value = entry.values.title
  return typeof value === 'string' && value.trim() !== '' ? value : entry.id
}

interface ResolvedMenuLink {
  readonly label: string
  /** `null` for an `entry`/`taxonomy`/`home` item whose target did not resolve to a public route. */
  readonly href: string | null
  readonly openInNewTab: boolean
  readonly kind: string
  /** The HTML `title` attribute (a tooltip) — `null` for none. Never this link's visible label. */
  readonly title: string | null
}

/**
 * The body `GET /api/menus/by-name/{name}` and `GET
 * /api/menus/by-location/{location}` both answer with — only the fields
 * this renderer reads. `packages/api/src/rest/menu-router.ts`'s
 * `serialiseItem`/`menuResponse` own the real, complete shape.
 */
interface MenuLookupBody {
  readonly items?: readonly {
    readonly label: string
    readonly kind: string
    readonly url: string | null
    readonly title: string | null
    readonly openInNewTab: boolean
    readonly resolvedLabel?: string
    readonly resolvedRoute?: string | null
  }[]
}

/**
 * Looks a menu up through the exact same `MenuRouter` `/api/menus/*` is
 * mounted with — an in-process call, `RestRequest` in and `RestResponse`
 * out, never a second lookup path or a real HTTP round trip to itself.
 * Shared by the by-location and by-name lookups below; only the path
 * differs.
 *
 * `null` for "no menu router wired" and "no menu found at all" alike: both
 * mean the slot renders empty, exactly as it always has.
 */
async function fetchMenuLinksFromPath(
  path: string,
  locale: string,
  options: { readonly menuRouter?: MenuRouter },
  context: AccessContext,
): Promise<readonly ResolvedMenuLink[] | null> {
  if (options.menuRouter === undefined) return null

  const response = await options.menuRouter.handle(
    { method: 'GET', path, query: { locale } },
    context,
  )
  if (response.status !== 200) return null

  const body = response.body as { readonly data?: MenuLookupBody } | null
  const items = body?.data?.items
  if (!Array.isArray(items)) return null

  return items.map((item) => ({
    label: item.resolvedLabel ?? item.label,
    // `url` carries its own stored destination; every other resolvable kind
    // (`entry`, `taxonomy`, `home`) is only ever linked through the
    // resolver's answer — never a second, ad hoc way to derive a route. A
    // `submenu-placeholder` has no resolver call at all, so `resolvedRoute`
    // is `undefined` for it and this falls through to `null`, exactly the
    // "no link, just a heading" case `renderMenuLinks` keeps.
    href: item.kind === 'url' ? item.url : (item.resolvedRoute ?? null),
    openInNewTab: item.openInNewTab,
    kind: item.kind,
    title: item.title,
  }))
}

/** Looks a menu up by its `location` (fiche 09, task 3) — the generic, theme-agnostic resolution. */
function fetchMenuLinksByLocation(
  location: string,
  locale: string,
  options: { readonly menuRouter?: MenuRouter },
  context: AccessContext,
): Promise<readonly ResolvedMenuLink[] | null> {
  return fetchMenuLinksFromPath(
    `/api/menus/by-location/${encodeURIComponent(location)}`,
    locale,
    options,
    context,
  )
}

/** Looks a menu up by its machine `name` — the legacy resolution `fetchMenuLinksForSlot` falls back to. */
function fetchMenuLinksByName(
  name: string,
  locale: string,
  options: { readonly menuRouter?: MenuRouter },
  context: AccessContext,
): Promise<readonly ResolvedMenuLink[] | null> {
  return fetchMenuLinksFromPath(
    `/api/menus/by-name/${encodeURIComponent(name)}`,
    locale,
    options,
    context,
  )
}

/**
 * Resolves the menu for one render slot (header or footer): by `location`
 * first — the only mechanism a future second theme needs, since it is a
 * property of the *menu*, never a name this file hardcodes — and, only when
 * nothing is assigned there, by the legacy `name` convention (`main`,
 * `footer`) this stand-in theme shipped with before locations existed. That
 * fallback is what lets a site created before task 3 keep its navigation
 * showing up unchanged: nothing about its data has to move for `/` to keep
 * rendering the menu it already had.
 */
async function fetchMenuLinksForSlot(
  location: string,
  legacyName: string,
  locale: string,
  options: { readonly menuRouter?: MenuRouter },
  context: AccessContext,
): Promise<readonly ResolvedMenuLink[] | null> {
  const byLocation = await fetchMenuLinksByLocation(location, locale, options, context)
  if (byLocation !== null) return byLocation
  return fetchMenuLinksByName(legacyName, locale, options, context)
}

/**
 * The subset of `ThemeRenderOptions` the menu lookups actually read —
 * narrowed so `renderPageChrome` (below) can be called from a page that has
 * no `ThemeRenderOptions` of its own (`search-page.ts`, `forms-page.ts`)
 * without either fabricating one or duplicating the lookup.
 */
export interface PageChromeMenus {
  readonly menuRouter?: MenuRouter
  readonly headerMenuLocation?: string
  readonly footerMenuLocation?: string
}

export interface PageChromeOptions {
  readonly site: { readonly name: string }
  readonly locale: string
  /** The joined skin+theme stylesheet (`STYLESHEET_PATH`). `null` renders unstyled rather than refused. */
  readonly styles: string | null
  /** Goes inside `<head>`, after the fixed `charset`/`viewport`/`color-scheme` meta tags — a `<title>`, `<meta name="robots">`, SEO tags, whatever the caller already built. */
  readonly headHtml: string
  /** The page's own content — normally a `<main id="cg-main">…</main>`, matching the skip-link's target. */
  readonly bodyHtml: string
  readonly menus?: PageChromeMenus
  /** Same live read `ThemeRenderOptions.branding` documents — absent means full Cogenta credit, the pre-task-8 behaviour. */
  readonly branding?: () => Promise<BrandingSettings>
  /** Same live read `ThemeRenderOptions.activeTheme` documents — absent renders with `DEFAULT_THEME_NAME`. */
  readonly activeTheme?: () => Promise<string | null>
  /**
   * Same live read `ThemeRenderOptions.seo` documents (fiche 21 task 3) —
   * only ever used here for `siteVerificationMetaTags` (fiche 50 task 2), so
   * `/search` and `/forms/{name}` carry the same Search Console/Webmaster
   * verification tags every entry page does. Absent renders neither tag,
   * the pre-fiche-50 behaviour.
   */
  readonly seo?: () => Promise<SeoRenderDefaults>
  /** Same live read `ThemeRenderOptions.identity` documents (audit T01) — absent renders the site name in text and Cogenta's default favicon. */
  readonly identity?: () => Promise<SiteIdentityMedia>
  /** Same batch loader `ThemeRenderOptions.loadMedia` documents. Absent means no logo and no favicon can be resolved, so both fall back. */
  readonly loadMedia?: (ids: readonly string[]) => Promise<ReadonlyMap<string, RenderMediaAsset>>
  /** Same live read `ThemeRenderOptions.chromeExtras` documents (contract D `theme@1.4`, L25 D2). Absent renders the pre-1.4 chrome. */
  readonly chromeExtras?: (locale: string) => Promise<ChromeExtras>
}

/**
 * The one page frame every public page shares: skip link, `color-scheme`
 * meta, site header with the primary navigation, the page's own content, the
 * footer with its own navigation.
 *
 * Extracted from `renderEntryPage` (below) so `/search` and `/forms/{name}`
 * (L20 audit, points 8-9) stop hand-rolling a second, thinner `<html>` shell
 * that carried the stylesheet link but none of the site's chrome — the two
 * pages looked unstyled not because the stylesheet failed to load, but
 * because the markup the stylesheet's selectors target (`.cg-site-header`,
 * `.cg-site-footer`, the skip link) was never there. `renderEntryPage` itself
 * is not routed through this helper: its admin bar, comments section and
 * analytics beacon are specific to a real content entry, and duplicating
 * `renderPageChrome`'s call there would only move the divergence risk rather
 * than remove it.
 */
export async function renderPageChrome(
  options: PageChromeOptions,
  context: AccessContext,
): Promise<string> {
  let headerNav: readonly ChromeNavLink[] = []
  let footerNav: readonly ChromeNavLink[] = []
  if (options.menus?.menuRouter !== undefined) {
    const [headerMenu, footerMenu] = await Promise.all([
      fetchMenuLinksForSlot(
        options.menus.headerMenuLocation ?? DEFAULT_HEADER_MENU_LOCATION,
        'main',
        options.locale,
        options.menus,
        context,
      ),
      fetchMenuLinksForSlot(
        options.menus.footerMenuLocation ?? DEFAULT_FOOTER_MENU_LOCATION,
        'footer',
        options.locale,
        options.menus,
        context,
      ),
    ])
    headerNav = headerMenu ?? []
    footerNav = footerMenu ?? []
  }

  const branding = await brandingFor(options.branding)
  const brandingHtml = renderFooterBranding(branding, DEFAULT_IMAGE_ENDPOINT)
  const theme = await themeFor(options.activeTheme)
  const identity = await resolveIdentity(options.site.name, DEFAULT_IMAGE_ENDPOINT, options)
  const chromeExtras = await resolveChromeExtras(
    options.chromeExtras,
    options.locale,
    options.menus,
    context,
  )
  const chrome = theme.renderChrome({
    site: options.site,
    locale: options.locale,
    // Not locale-prefixed on purpose, matching this route's pre-existing
    // behaviour — a genuine, pre-existing gap in a multi-locale deployment,
    // tracked separately rather than folded into this change.
    homeHref: '/',
    headerNav,
    footerNav,
    brandingHtml,
    brand: identity.brand,
    ...chromeExtras,
  })
  const verificationTags = siteVerificationMetaTags(
    options.seo === undefined ? null : await options.seo(),
  )

  return `<!doctype html>
<html lang="${escapeAttribute(options.locale)}" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${faviconLinkTag(identity.faviconHref, branding, DEFAULT_IMAGE_ENDPOINT)}
${feedLinkTags(options.site.name)}
${fontPreconnectTags()}
${options.headHtml}
${verificationTags === '' ? '' : `${verificationTags}\n`}${options.styles === null ? '' : `<link rel="stylesheet" href="${STYLESHEET_PATH}">`}
</head>
<body>
<a class="cg-skip-link" href="#cg-main">Skip to content</a>
${chrome.header}
${options.bodyHtml}
${chrome.footer}
</body>
</html>
`
}

/**
 * The public-site admin bar (fiche 35 task 6) — WordPress's most-used
 * shortcut, in the three links this codebase can actually back today:
 * straight into the admin shell, to editing this exact entry, and to
 * starting a new one in the same collection.
 *
 * Plain `<a href>`s and one scoped `<style>` block, nothing else: the
 * theme's own zero-executable-client-JavaScript policy (`serve.test.ts`,
 * "no executable client JavaScript anywhere on the page") applies to this
 * markup exactly as it does to the rest of the page — there is no `onclick`,
 * no toggle, nothing that needs a script to work.
 *
 * Its three labels used to be hardcoded English, and its first one hardcoded
 * the word "Cogenta" — visible to every signed-in editor of a French, or
 * white-labelled, site (audit 2026-09-01, 10-coquille-reglages-dashboard.md
 * T02). Both are now resolved: the name follows the same
 * `showCogentaBranding` switch the footer credit already follows, and the
 * labels come from the two-language table below.
 *
 * A table rather than `react-i18next` (ADR-0019's library) because this is
 * pure server-rendered HTML with no React runtime anywhere near it; three
 * strings do not justify pulling an i18n runtime into the render path. The
 * language is the page's own — a visitor reading the French edition of a
 * page gets French chrome, which is also the only locale signal this render
 * has (an `Actor` carries `id` and `roles`, and no locale).
 */
const ADMIN_BAR_LABELS: Record<string, { readonly edit: string; readonly create: string }> = {
  en: { edit: 'Edit this page', create: 'New' },
  fr: { edit: 'Modifier cette page', create: 'Nouveau' },
}

function adminBarLabels(locale: string): { readonly edit: string; readonly create: string } {
  // `fr-CA` and `fr` get the same table entry; anything with no entry gets
  // English rather than a key or an empty string.
  const base = locale.split('-')[0]?.toLowerCase() ?? 'en'
  return ADMIN_BAR_LABELS[base] ?? (ADMIN_BAR_LABELS.en as { edit: string; create: string })
}

function renderAdminBar(
  collectionName: string,
  entryId: string,
  options: {
    readonly siteName: string
    readonly showCogentaBranding: boolean
    readonly locale: string
  },
): string {
  const collection = encodeURIComponent(collectionName)
  const entry = encodeURIComponent(entryId)
  const labels = adminBarLabels(options.locale)
  // A white-labelled site names itself, never the CMS behind it — the same
  // rule `renderFooterBranding` already applies to the credit below.
  const adminName = options.showCogentaBranding ? 'Cogenta' : options.siteName
  const home = escapeHtml(adminName)
  return `<div class="cg-admin-bar" role="navigation" aria-label="${escapeAttribute(adminName)}">
<style>
.cg-admin-bar{display:flex;gap:1rem;align-items:center;padding:0.4rem 1rem;background:#1a1a1a;color:#fff;font:500 0.8125rem/1.4 system-ui,sans-serif;position:sticky;top:0;z-index:1000}
.cg-admin-bar a{color:#fff;text-decoration:none;opacity:0.85}
.cg-admin-bar a:hover,.cg-admin-bar a:focus-visible{opacity:1;text-decoration:underline}
</style>
<a href="/admin">${home}</a>
<a href="/admin/collections/${collection}/${entry}">${escapeHtml(labels.edit)}</a>
<a href="/admin/collections/${collection}/new">${escapeHtml(labels.create)}</a>
</div>`
}

async function fetchOne(
  gateway: ContentGateway,
  request: QueryRequest,
  context: AccessContext,
): Promise<ContentEntry | null> {
  const page = await gateway.list({ ...request, limit: 1 }, context)
  return page.items[0] ?? null
}

/**
 * Matches `pathname` against the site's real routes and fetches the one
 * published entry there, or `null` for "no route" or "nothing published" —
 * the two callers (`renderRequestedPage` and its own `content.byPath`) share
 * this rather than each re-deriving the same filter from `match.params`.
 *
 * `/` itself matches no collection's route (every `page` pattern is
 * `/:slug`, which needs a real segment), so `/` retries once as
 * `homePathFor(options)` — the `reading.homePath` site setting when one is
 * stored (fiche 23 task 4), `/home` otherwise, the slug every
 * `create-cogenta` blueprint seeds its home page at. Not a magic redirect: a
 * site with no page at that path still 404s honestly, exactly like every
 * other unmatched path.
 */
export async function resolveEntry(
  pathname: string,
  options: ThemeRenderOptions,
  context: AccessContext,
): Promise<{ readonly collection: CollectionDefinition; readonly entry: ContentEntry } | null> {
  const effectivePath = pathname === '/' ? await homePathFor(options) : pathname
  const match = matchPath(options.collections, effectivePath, {
    locales: options.site.locales,
    defaultLocale: options.site.defaultLocale,
  })
  if (match === null) return null

  const collection = options.collections.find((entry) => entry.name === match.collection)
  if (collection === undefined) return null

  const conditions = Object.entries(match.params).map(([field, value]) => ({
    field,
    operator: 'eq' as const,
    value,
  }))
  const filter: Filter | undefined =
    conditions.length === 1
      ? conditions[0]
      : conditions.length > 1
        ? { and: conditions }
        : undefined

  const entry = await fetchOne(
    options.gateway,
    {
      collection: match.collection,
      ...(filter === undefined ? {} : { filter }),
      ...(match.locale === null ? {} : { locale: match.locale }),
    },
    context,
  )
  return entry === null ? null : { collection, entry }
}

/**
 * Resolves `pathname` against the site's real routes and renders the real
 * page, or returns `null` — never for "matched but nothing found", only for
 * "no route matches" or "matched but nothing published there", both of which
 * the caller turns into the same 404 an unmatched `/api/*` request already
 * gets.
 */
export async function renderRequestedPage(
  pathname: string,
  options: ThemeRenderOptions,
  context: AccessContext,
): Promise<string | null> {
  const resolved = await resolveEntry(pathname, options, context)
  if (resolved === null) return null
  return renderEntryPage(pathname, resolved.collection, resolved.entry, options, context)
}

/**
 * An entry that is not what the database holds — the block list an editor has
 * on screen and has not saved yet.
 *
 * `blocks` is the whole zone map, exactly the shape the admin already keeps
 * and already sends to `PUT /api/content/:collection/:id`; nothing here is a
 * second, builder-only serialisation of a page.
 */
export interface DraftPage {
  readonly collection: string
  readonly entryId: string
  readonly blocks: BlockZones
  /** Only the typed fields that changed. Absent fields keep the stored value. */
  readonly values?: Readonly<Record<string, unknown>>
}

/**
 * Renders an in-progress draft through the *same* function that renders the
 * published page — the single reason this export exists.
 *
 * The visual page builder (L16 task 1) shows this HTML in an iframe rather
 * than re-implementing the twelve blocks in React. The whole point of that
 * choice is that there is no second renderer to drift, so this must not
 * become one: it reads the stored entry through the same permission-checked
 * gateway, overlays the unsaved blocks and values on it, and then hands the
 * result to `renderEntryPage` unchanged. Handed a draft that equals what is
 * stored, it returns the published page byte for byte — which is exactly what
 * `theme-render-fidelity.test.ts` asserts.
 *
 * `null` means the entry does not exist or this actor may not read it. The
 * caller turns both into the same 404, and neither says which.
 */
export async function renderDraftPage(
  draft: DraftPage,
  options: ThemeRenderOptions,
  context: AccessContext,
): Promise<string | null> {
  const collection = options.collections.find((entry) => entry.name === draft.collection)
  if (collection === undefined) return null

  const stored = await options.gateway.read(draft.collection, draft.entryId, context)
  if (stored === null) return null

  const entry: ContentEntry = {
    ...stored,
    values: { ...stored.values, ...(draft.values ?? {}) },
    blocks: draft.blocks,
  }

  // The path the entry really lives at, built from the same `buildPath` the
  // public route uses — never a synthetic `/preview/...` URL. A canonical
  // link, an `og:url` and a `collectionList` link all have to come out of
  // this render identical to the published page's, and they are all derived
  // from this one string.
  const pathname = buildPath(
    collection,
    Object.fromEntries(
      Object.entries(entry.values).filter(
        (pair): pair is [string, string] => typeof pair[1] === 'string',
      ),
    ),
    entry.locale ?? undefined,
  )

  return renderEntryPage(pathname, collection, entry, options, context)
}

/** ~200 words/minute, rounded up — `PageContent.entry.readingMinutes` (contract D `theme@1.4`). `0` (no text at all) is not a reading time, so it is left unset instead. */
function richTextWordCount(document: RichTextDocument): number {
  let words = 0
  for (const node of document) {
    if (node._type !== 'block') continue
    const text = node.children.map((span) => span.text).join(' ')
    words += text.split(/\s+/u).filter((word) => word.length > 0).length
  }
  return words
}

/**
 * Every taxonomy term this entry is classified under, resolved to a label
 * and a route through `options.resolveTerm` — one taxonomy field per
 * `relationsOf(collection)` entry of `kind: 'taxonomy'`, a to-many field's
 * value being an array of ids and a to-one field's a single id.
 *
 * `undefined` when `options.resolveTerm` was never wired — the pre-1.4
 * behaviour — never a half-resolved list with some terms silently dropped.
 */
async function entryTerms(
  entry: ContentEntry,
  collection: CollectionDefinition,
  resolveTerm: ThemeRenderOptions['resolveTerm'],
): Promise<readonly PageEntryTerm[] | undefined> {
  if (resolveTerm === undefined) return undefined
  const taxonomyFields = relationsOf(collection).filter((relation) => relation.kind === 'taxonomy')
  if (taxonomyFields.length === 0) return undefined

  const terms: PageEntryTerm[] = []
  for (const field of taxonomyFields) {
    const raw = entry.values[field.field]
    const ids = Array.isArray(raw) ? raw : typeof raw === 'string' && raw !== '' ? [raw] : []
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') continue
      const resolved = await resolveTerm(field.to, id)
      if (resolved === null) continue
      terms.push({ taxonomy: field.to, label: resolved.label, href: resolved.route })
    }
  }
  return terms.length === 0 ? undefined : terms
}

/**
 * `PageContent.entry` (contract D `theme@1.4`) — every field a theme's
 * `renderEntryHeader` needs, beyond the blocks a page already carries.
 * `themeEntry` is the already-flattened theme-shaped entry (`toThemeEntry`),
 * which is what `entryImage`/`entryExcerpt` read; `entry`/`collection` are
 * the raw schema shapes, which is what system fields and taxonomy field
 * declarations live on.
 */
async function buildEntryMeta(
  entry: ContentEntry,
  collection: CollectionDefinition,
  themeEntry: ThemeContentEntry,
  themeContext: RenderContext,
  options: ThemeRenderOptions,
): Promise<PageEntryMeta> {
  const author =
    options.authorFor === undefined || entry.createdBy === null
      ? undefined
      : ((await options.authorFor(entry.createdBy)) ?? undefined)

  const richTextField = Object.entries(collection.fields).find(
    ([, field]) => field.kind === 'richText',
  )?.[0]
  const richTextValue = richTextField === undefined ? undefined : entry.values[richTextField]
  const words = Array.isArray(richTextValue)
    ? richTextWordCount(richTextValue as RichTextDocument)
    : 0

  const image = entryImage(themeEntry, themeContext)
  const excerpt = entryExcerpt(themeEntry)
  const terms = await entryTerms(entry, collection, options.resolveTerm)

  return {
    collection: collection.name,
    ...(entry.publishedAt === null ? {} : { publishedAt: entry.publishedAt }),
    updatedAt: entry.updatedAt,
    ...(image === undefined ? {} : { image }),
    ...(excerpt === undefined ? {} : { excerpt }),
    ...(author === undefined ? {} : { author }),
    ...(terms === undefined ? {} : { terms }),
    ...(words === 0 ? {} : { readingMinutes: Math.ceil(words / 200) }),
  }
}

/**
 * The one page renderer. Both `renderRequestedPage` (published) and
 * `renderDraftPage` (unsaved) end here, having only differed in how they got
 * hold of an entry.
 */
async function renderEntryPage(
  pathname: string,
  collection: CollectionDefinition,
  entry: ContentEntry,
  options: ThemeRenderOptions,
  context: AccessContext,
): Promise<string> {
  const blocks = toVocabularyBlocks(entry, collection)

  // Every entry a `collectionList` block needs is fetched up front — the
  // theme's own contract (`FetchedEntries`, `render-block.ts`) requires it:
  // `renderBlock` is a pure, synchronous function, so nothing inside it can
  // await a query, and `link()` below must resolve an id to a URL without one
  // either.
  const fetchedEntries: Record<string, readonly ThemeContentEntry[]> = {}
  const knownEntries = new Map<string, ContentEntry>([[entry.id, entry]])
  /** Which collection each known entry came from — a `ContentEntry` does not say. */
  const entryCollections = new Map<string, string>([[entry.id, collection.name]])
  for (const block of blocks) {
    if (block._type !== 'collectionList') continue
    const themeQuery = collectionListQuery(block)
    const results = await options.gateway.list(toApiQueryRequest(themeQuery), context)
    fetchedEntries[block._key] = results.items.map((found) =>
      toThemeEntry(found, themeQuery.collection),
    )
    for (const found of results.items) {
      knownEntries.set(found.id, found)
      entryCollections.set(found.id, themeQuery.collection)
    }
  }

  const collectionsByName = new Map(options.collections.map((entry) => [entry.name, entry]))

  // Rich text (ADR-0013) can carry its own `media` nodes and `internalLink`
  // marks, invisible to `collectDependencies` (see `collectRichTextAssets`).
  // Every linked entry is fetched through the same permission-checked
  // `gateway.read` a preview already uses: a target that is trashed, still a
  // draft, or simply gone comes back `null` and is left out of `knownEntries`
  // — `link()` below then resolves it to `'#'`, and `renderRichText` turns
  // that into plain text rather than a dead anchor, never a 404.
  const richTextAssets = collectRichTextAssets(blocks)
  for (const target of richTextAssets.links) {
    if (knownEntries.has(target.id)) continue
    if (!collectionsByName.has(target.collection)) continue
    const found = await options.gateway.read(target.collection, target.id, context)
    if (found === null) continue
    knownEntries.set(found.id, found)
    entryCollections.set(found.id, target.collection)
  }

  // Which media this page references, from the same walk `/api/content` uses
  // to declare a response's dependencies (`collectDependencies`): declared
  // `media` fields *and* the media inside every block, resolved through the
  // block registry rather than guessed at from the JSON. A `ContentEntry`
  // plus its collection name is exactly a `SerialisedEntry`, which is why
  // this reuse costs nothing. Rich text's own media nodes are merged in
  // separately, above.
  const mediaAssets = new Map<string, RenderMediaAsset>()
  if (options.loadMedia !== undefined) {
    const dependencies = collectDependencies(
      [...knownEntries].map(([id, found]) => ({
        ...found,
        collection: entryCollections.get(id) ?? collection.name,
      })),
      { collection: (name) => collectionsByName.get(name) },
    )
    const mediaIds = new Set([...dependencies.media, ...richTextAssets.media])
    if (mediaIds.size > 0) {
      for (const [id, asset] of await options.loadMedia([...mediaIds])) {
        mediaAssets.set(id, asset)
      }
    }
  }

  const imageEndpoint = options.imageEndpoint ?? DEFAULT_IMAGE_ENDPOINT

  const link = (target: LinkTargetInput): string => {
    if (typeof target === 'string') return target
    if ('path' in target) return target.path
    const found = knownEntries.get(target.id)
    const targetCollection = collectionsByName.get(target.collection)
    if (found === undefined || targetCollection === undefined) {
      // Not among the entries this render already fetched — the honest
      // answer is "unresolvable here", not a guess. A real Astro site would
      // resolve this ahead of render from its own link-graph; this stand-in
      // doesn't build one.
      return '#'
    }
    try {
      return buildPath(
        targetCollection,
        Object.fromEntries(
          Object.entries(found.values).filter(
            (pair): pair is [string, string] => typeof pair[1] === 'string',
          ),
        ),
        found.locale ?? undefined,
      )
    } catch (error) {
      // A route param can be missing on real content — a routed collection's
      // slug-kind field is not `required`, so a saved-but-incomplete entry
      // (a draft published without a slug, for instance) is reachable through
      // a `collectionList` or a rich-text link long before anyone fixes it.
      // One unresolvable target must not fail the whole page: the same "the
      // honest answer is unresolvable" rule above applies here too.
      if (isCogentaError(error) && error.code === 'CONTENT_ROUTE_INVALID') return '#'
      throw error
    }
  }

  const themeContext: RenderContext = {
    site: options.site,
    locale: entry.locale,
    url: new URL(pathname, options.site.url),
    t: createThemeTranslator(entry.locale),
    // The real `srcset`, from `@cogenta/render`'s own `describeMedia` (L10
    // task 5). Pure and synchronous, as contract D requires: the asset was
    // loaded before this render started, and this only builds URLs against
    // the variants the upload already wrote.
    image: (media, imageOptions) => {
      const asset = mediaAssets.get(media)
      if (asset === undefined) {
        throw new CogentaError({
          code: 'THEME_IMAGE_UNSUPPORTED',
          message: `No media asset "${media}" is available to this render.`,
          hint: 'The image must be referenced by a media field or a block of this page — those are the ones loaded before rendering. Check that the asset still exists in the media library.',
          details: { media },
        })
      }
      return describeMedia(asset, imageOptions ?? {}, {
        endpoint: imageEndpoint,
        mediaEndpoint: imageEndpoint,
      })
    },
    link,
    content: {
      entry: async (collectionName: string, id: string) => {
        const found = knownEntries.get(id)
        return found === undefined ? null : toThemeEntry(found, collectionName)
      },
      byPath: async (path: string) => {
        const match = matchPath(options.collections, path, {
          locales: options.site.locales,
          defaultLocale: options.site.defaultLocale,
        })
        if (match === null) return null
        const conditions = Object.entries(match.params).map(([field, value]) => ({
          field,
          operator: 'eq' as const,
          value,
        }))
        const found = await fetchOne(
          options.gateway,
          {
            collection: match.collection,
            ...(conditions.length === 0
              ? {}
              : { filter: conditions.length === 1 ? conditions[0] : { and: conditions } }),
            ...(match.locale === null ? {} : { locale: match.locale }),
          },
          context,
        )
        return found === null ? null : toThemeEntry(found, match.collection)
      },
      list: (request: ThemeQueryRequest) => listAsTheme(options.gateway, request, context),
    },
  }

  const themeEntry = toThemeEntry(entry, collection.name)
  const entryMeta = await buildEntryMeta(entry, collection, themeEntry, themeContext, options)
  const pageContent: PageContent = { title: entryTitle(entry), blocks, entry: entryMeta }
  const theme = await themeFor(options.activeTheme)
  const node = theme.renderPage(
    pageContent,
    themeContext,
    fetchedEntries as FetchedEntries,
    options.blocks,
  )
  const bodyHtml = serialize(node)

  // The comment thread and form (fiche 15 task 6) — a property of the route,
  // not of the page's own blocks, so it is appended after `<main>` rather
  // than folded into `renderPage`'s tree (see `ThemeRenderOptions.comments`'s
  // own comment for why that also keeps the L16 fidelity test true).
  const commentsOptions = options.comments
  let commentsHtml = ''
  if (commentsOptions !== undefined) {
    const data = await commentsOptions.forEntry(collection.name, entry.id, entry.locale)
    commentsHtml = serialize(
      renderCommentsSection({
        comments: data.items,
        open: data.open,
        action: commentsOptions.action,
        collection: collection.name,
        entryId: entry.id,
        locale: entry.locale,
        pagePath: pathname,
        ...(commentsOptions.honeypotField === undefined
          ? {}
          : { honeypotField: commentsOptions.honeypotField }),
        renderedAt: Date.now(),
      }),
    )
  }

  // The head is `@cogenta/seo`'s, not this file's: title, description,
  // canonical, hreflang, Open Graph, Twitter Card and JSON-LD, all derived
  // from the real entry and the real collection (L10 task 1). Nothing here
  // decides what is indexable — `buildMetaTags` asks `isPublished` itself, so
  // a preview render carries `noindex` without this caller remembering to.
  //
  // `seoSettings` (fiche 21 task 3) is fetched once here, read fresh on every
  // render rather than cached at server startup — see `ThemeRenderOptions.seo`'s
  // own doc comment. It feeds both the site-wide fields below (`description`,
  // `twitterSite`) and the per-page title template/fallback image.
  const storedSeoSettings = options.seo === undefined ? null : await options.seo()
  // The site's own identity (audit T01). Resolved here rather than beside
  // the chrome below because the share image it carries has to reach the SEO
  // pipeline: `shareImageMediaId` is a *source* for
  // `seo.defaultSocialImageUrl`, not a second social-image mechanism — see
  // `resolveIdentity`.
  const identity = await resolveIdentity(options.site.name, imageEndpoint, options)
  // Resolved here, above both its consumers: the admin bar's own name follows
  // the same white-label switch as the footer credit, and the favicon's
  // fallback follows it too (see `faviconLinkTag`).
  const branding = await brandingFor(options.branding)
  const seoSettings =
    identity.shareImageUrl === null || storedSeoSettings === null
      ? storedSeoSettings
      : { ...storedSeoSettings, defaultSocialImageUrl: identity.shareImageUrl }
  const seoSite = seoSiteFor(options.site, seoSettings)
  const resource = { collection, entry }
  const alternates = await alternatesForEntry(
    seoSite,
    collection,
    entry,
    options.gateway,
    context,
    options.site.locales,
  )
  // `og:image` and JSON-LD's `image` come from the same assets the page just
  // rendered, resolved to an absolute URL — a social crawler never sends a
  // session and never follows a relative path.
  const seoMedia = (id: string): SeoImage | null => {
    const asset = mediaAssets.get(id)
    if (asset === undefined || asset.kind !== 'image') return null
    if (asset.width === undefined || asset.height === undefined) return null
    const source = describeMedia(
      asset,
      {},
      { endpoint: imageEndpoint, mediaEndpoint: imageEndpoint },
    )
    return {
      url: new URL(source.src, options.site.url).toString(),
      width: source.width,
      height: source.height,
      ...(source.alt === '' ? {} : { alt: source.alt }),
    }
  }

  // `head` already carries a real `<title>` (`renderSeoHead`, above) — no
  // second one is written into the template below.
  const head = [
    renderSeoHead(seoSite, resource, {
      ...(alternates.length === 0 ? {} : { alternates }),
      ...(mediaAssets.size === 0 ? {} : { media: seoMedia }),
      ...(seoSettings === null ? {} : { seo: seoSettings }),
    }),
    // Search Console/Webmaster Tools verification (fiche 50 task 2) — the
    // same site-wide tags on every page, not just the home page: neither
    // provider documents which page it fetches to check ownership.
    siteVerificationMetaTags(seoSettings),
  ]
    .filter((part) => part !== '')
    .join('\n')

  // Precaution 1 of 3 (fiche 35 task 6): only ever rendered for an actor
  // this request's own `resolveActor` actually authenticated — the flag
  // alone (set for every request on this path, anonymous included) is not
  // the gate, this check is.
  const adminBar =
    options.adminBar === true && context.actor.id !== null
      ? renderAdminBar(collection.name, entry.id, {
          siteName: options.site.name,
          showCogentaBranding: branding.showCogentaBranding,
          locale: themeContext.locale,
        })
      : ''

  // The navigation menus (audit follow-up to L13's menu system, generalised
  // to real `location`s by fiche 09 task 3): the menu assigned to the header
  // location, the one assigned to the footer location — see
  // `ThemeRenderOptions.headerMenuLocation`/`footerMenuLocation` for why the
  // location key is a per-render option rather than a name this file
  // hardcodes, and `fetchMenuLinksForSlot` for the legacy-name fallback that
  // keeps a pre-task-3 site's navigation rendering unchanged. Both are
  // `null`, rendering nothing, on a site with no menu router wired or no
  // menu in that slot at all — the same empty slots as before this was
  // wired.
  const [headerMenu, footerMenu] = await Promise.all([
    fetchMenuLinksForSlot(
      options.headerMenuLocation ?? DEFAULT_HEADER_MENU_LOCATION,
      'main',
      themeContext.locale,
      options,
      context,
    ),
    fetchMenuLinksForSlot(
      options.footerMenuLocation ?? DEFAULT_FOOTER_MENU_LOCATION,
      'footer',
      themeContext.locale,
      options,
      context,
    ),
  ])
  const brandingHtml = renderFooterBranding(branding, imageEndpoint)
  const chromeExtras = await resolveChromeExtras(
    options.chromeExtras,
    themeContext.locale,
    options,
    context,
  )
  const chrome = theme.renderChrome({
    site: options.site,
    locale: themeContext.locale,
    // Not locale-prefixed on purpose, matching this route's pre-existing
    // behaviour — see `renderPageChrome`'s own identical comment.
    homeHref: '/',
    headerNav: headerMenu ?? [],
    footerNav: footerMenu ?? [],
    brandingHtml,
    brand: identity.brand,
    ...chromeExtras,
  })

  // The same frame `Base.astro` builds for a real Astro build: a skip link
  // first, the site's own chrome, the content, a footer. Rendering the
  // `<main>` alone — which this did until the theme's own stylesheet started
  // being served — left every page with no landmark to skip to and no way back
  // to the home page.
  return `<!doctype html>
<html lang="${themeContext.locale}" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${faviconLinkTag(identity.faviconHref, branding, imageEndpoint)}
${feedLinkTags(options.site.name)}
${fontPreconnectTags()}
${head}
${options.styles === null ? '' : `<link rel="stylesheet" href="${STYLESHEET_PATH}">`}
</head>
<body>
<a class="cg-skip-link" href="#cg-main">Skip to content</a>
${adminBar}
${chrome.header}
${bodyHtml}
${commentsHtml}
${chrome.footer}
${analyticsBeaconTag(pathname, options.analyticsBeacon)}
</body>
</html>
`
}

/**
 * Self-hosted, cookie-free page-view analytics (`@cogenta/analytics`), L10
 * analytics gap. An invisible `<img>` pixel rather than any inline
 * `<script>`: the theme's own policy is **zero executable client
 * JavaScript** on a rendered page (enforced by `serve.test.ts`), so a script
 * reading `document.referrer` is not an option here. Everything the pixel's
 * URL needs — the path being viewed, and the `Referer` header of the request
 * that is rendering this very page — is already known server-side, so
 * nothing needs to run in the browser to capture it.
 *
 * `undefined` (no `analyticsBeacon` at all) omits the tag entirely — used
 * for the page builder's draft preview, which must not be counted as a real
 * visit. `alt=""` and the visually-hidden inline style keep it out of a
 * screen reader and off the visible page without `display:none`, which some
 * older ad-blocking heuristics treat as a signal to strip the element (and
 * losing the pixel loses nothing here — it fails silently either way, R1/R2
 * spirit: analytics is additive, never load-bearing).
 */
function analyticsBeaconTag(
  pathname: string,
  beacon: { readonly referrer?: string | undefined } | undefined,
): string {
  if (beacon === undefined) return ''
  const params = new URLSearchParams({ p: pathname })
  if (beacon.referrer !== undefined && beacon.referrer !== '') {
    params.set('r', beacon.referrer)
  }
  const src = escapeAttribute(`/api/analytics/beacon?${params.toString()}`)
  return `<img src="${src}" alt="" width="1" height="1" loading="eager" decoding="async" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;">`
}

/**
 * Reads `theme.tokens.json` next to the config and renders it through the
 * real, already-tested `renderSkin` (contract D validation + `--cogenta-*`
 * stylesheet) — never a second, hand-rolled token-to-CSS mapping. Absent or
 * invalid tokens degrade to unstyled HTML rather than refusing to serve.
 */
export async function loadSkinCss(
  readFile: (path: string) => Promise<string>,
  tokensPath: string,
): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(tokensPath)) as unknown
    return renderSkin(raw).css
  } catch {
    return null
  }
}

/**
 * The two sheets a page needs, in the only order that works: the skin's
 * generated custom properties first, then the theme's stylesheet that reads
 * them. Either half may be missing — a project with no `theme.tokens.json`
 * still gets the theme's layout, and a theme package that cannot be resolved
 * still gets the skin's properties — and a page with neither is served
 * unstyled rather than refused.
 */
export function joinStyles(skinCss: string | null, themeCss: string | null): string | null {
  const sheets = [
    skinCss === null ? null : minifyCss(skinCss),
    themeCss === null ? null : minifyCss(themeCss),
  ].filter((sheet): sheet is string => sheet !== null)
  return sheets.length === 0 ? null : sheets.join('\n')
}

/**
 * The appearance screen's theme gallery preview (fiche L24 task 5) — one
 * fixed, database-free demo page, rendered through whichever theme package
 * is asked for by name.
 *
 * **Option (a) of the task's own note, chosen over (b) ("preview the site's
 * real home page")**, for two reasons:
 *
 *  1. an admin comparing themes is often doing it *before* the site has any
 *     content at all — the moment a real-home-page preview would have
 *     nothing to show, or would 404 the whole comparison;
 *  2. every candidate theme has to render the *same* page for the
 *     comparison to mean anything. A real home page would let one theme's
 *     card look richer than another's purely because that site's current
 *     home happens to use more blocks — an artifact of this site's content,
 *     not of the theme.
 *
 * The three blocks below (hero, collectionList, featureGrid) are the same
 * shape `create-cogenta`'s "blog" blueprint seeds a real home page with
 * (`packages/create-cogenta/src/blueprints/blog.ts`) — realistic content a
 * theme actually has to lay out, not lorem ipsum — but the `collectionList`
 * entries are fabricated in-process rather than queried, and nothing here
 * ever touches `ContentGateway`/the database: a card in this gallery cannot
 * leak draft or private content because it never reads content of any kind.
 * `link()` and `image()` below reflect that — an entry link resolves to
 * `'#'` rather than a real route, and `image()` refuses, because the demo
 * page never references a real media asset in the first place.
 */
const GALLERY_PREVIEW_BLOCK_VERSION = '1.0.0'
const GALLERY_PREVIEW_COLLECTION_LIST_KEY = 'gallery-preview-posts'

function galleryPreviewPage(): PageContent {
  return {
    title: 'A site that looks like yours',
    blocks: [
      {
        _key: 'gallery-preview-hero',
        _type: 'hero',
        _version: GALLERY_PREVIEW_BLOCK_VERSION,
        eyebrow: 'Preview',
        title: 'A site that looks like yours',
        subtitle:
          'This is fixed demo content, shown identically across every theme, so you can compare layouts on equal footing.',
        actions: [
          { label: 'Get started', target: { href: '#' }, emphasis: 'primary' },
          { label: 'Learn more', target: { href: '#' }, emphasis: 'secondary' },
        ],
      } as VocabularyBlock,
      {
        _key: GALLERY_PREVIEW_COLLECTION_LIST_KEY,
        _type: 'collectionList',
        _version: GALLERY_PREVIEW_BLOCK_VERSION,
        title: 'Latest posts',
        collection: 'post',
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 3,
        layout: 'list',
      } as VocabularyBlock,
      {
        _key: 'gallery-preview-features',
        _type: 'featureGrid',
        _version: GALLERY_PREVIEW_BLOCK_VERSION,
        title: 'What you get',
        items: [
          {
            _key: 'gallery-preview-feature-1',
            icon: 'blocks',
            title: 'Blocks, not HTML',
            text: 'Every section of a page is structured data. The theme decides what it looks like.',
          },
          {
            _key: 'gallery-preview-feature-2',
            icon: 'content',
            title: 'Your real content',
            text: 'Switching themes never touches your entries — only how they are laid out.',
          },
          {
            _key: 'gallery-preview-feature-3',
            icon: 'zero-js',
            title: 'No client JavaScript',
            text: 'Every theme in this gallery ships zero executable client JavaScript.',
          },
        ],
      } as VocabularyBlock,
    ],
  }
}

/** Three fabricated posts for the demo `collectionList` above — never a real query result. */
function galleryPreviewEntries(locale: string): readonly ThemeContentEntry[] {
  const posts: readonly { readonly title: string; readonly excerpt: string }[] = [
    {
      title: 'Welcome to your new site',
      excerpt:
        'A short introduction to what you can do here, once real content replaces this demo.',
    },
    {
      title: 'How themes work',
      excerpt: 'A theme lays out your content; it never stores any of it. Switch freely.',
    },
    {
      title: 'Zero client JavaScript, by policy',
      excerpt:
        'Every theme in the gallery renders without shipping a single script to the browser.',
    },
  ]
  return posts.map((post, index) => ({
    id: `gallery-preview-${index}`,
    collection: 'post',
    locale,
    status: 'published' as const,
    title: post.title,
    excerpt: post.excerpt,
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
  }))
}

/** Demo navigation for the gallery preview's header/footer — never a real menu lookup. */
const GALLERY_PREVIEW_HEADER_NAV: readonly ChromeNavLink[] = [
  { label: 'Home', href: '/', openInNewTab: false, kind: 'url', title: null },
  { label: 'Blog', href: '#', openInNewTab: false, kind: 'url', title: null },
  { label: 'About', href: '#', openInNewTab: false, kind: 'url', title: null },
]
const GALLERY_PREVIEW_FOOTER_NAV: readonly ChromeNavLink[] = [
  { label: 'Privacy', href: '#', openInNewTab: false, kind: 'url', title: null },
]

/**
 * Synthetic `theme@1.4` chrome (contract D, L25 D2) — this route reads no
 * database (see `renderThemeGalleryPreview`'s own comment), so a real
 * `general.socialLinks`/`general.tagline`/`general.footerNote` never reaches
 * it; fixed demo values instead, the same way the nav above is fixed rather
 * than empty, so the gallery actually shows what a candidate theme does with
 * these fields rather than leaving them permanently blank.
 */
const GALLERY_PREVIEW_TAGLINE = 'A site that looks like yours'
const GALLERY_PREVIEW_SOCIAL: readonly ChromeLink[] = [
  { label: 'X', href: 'https://x.com/cogenta' },
  { label: 'GitHub', href: 'https://github.com/cogenta-cms' },
  { label: 'Mastodon', href: 'https://mastodon.social/@cogenta' },
]
const GALLERY_PREVIEW_FOOTER_NOTE = 'Built with Cogenta — a CMS that runs itself.'
const GALLERY_PREVIEW_HEADER_ACTION: ChromeLink = { label: 'Get started', href: '#' }

export interface ThemeGalleryPreviewOptions {
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  /**
   * The combined skin + *this candidate theme's* stylesheet, already
   * resolved by the caller (`serve.ts`'s `themeGalleryStyles`) — never the
   * currently active theme's own CSS, which is what `styles`/`resolveStyles`
   * elsewhere in this file give. Inlined into the response as a `<style>`
   * tag rather than linked, the same reasoning `/api/theme/preview` already
   * gives: this HTML is consumed as `srcDoc` by the admin's own iframe, not
   * served at a real URL on the site's own origin, so a `<link
   * rel="stylesheet">` would either resolve against the wrong origin or
   * serve the *active* theme's sheet regardless of which candidate this is.
   */
  readonly styles: string | null
  readonly branding?: () => Promise<BrandingSettings>
}

/**
 * Renders the fixed demo page above through `themeName`, resolved through
 * the same `theme-registry.ts` every other theme lookup on this server uses.
 * An unrecognised name is the caller's responsibility to refuse before
 * calling this — `resolveTheme` itself falls back to the built-in default
 * rather than throwing (see its own comment), which is the right behaviour
 * for a live page render but not for a gallery card that claims to preview
 * one specific theme.
 */
export async function renderThemeGalleryPreview(
  themeName: string,
  options: ThemeGalleryPreviewOptions,
): Promise<string> {
  const theme = await resolveTheme(themeName)
  const locale = options.site.defaultLocale

  const link = (target: LinkTargetInput): string => {
    if (typeof target === 'string') return target
    if ('path' in target) return target.path
    // A demo entry has no real route — same "honest unresolvable answer" as
    // `renderEntryPage`'s own `link`, just never populated here.
    return '#'
  }

  const image = (media: MediaReference, _imageOptions?: ImageOptions): ImageSource => {
    throw new CogentaError({
      code: 'THEME_IMAGE_UNSUPPORTED',
      message: `No media asset "${media}" is available to the theme gallery preview.`,
      hint: 'This preview renders fixed, image-free demo content by design — see renderThemeGalleryPreview.',
      details: { media },
    })
  }

  const themeContext: RenderContext = {
    site: options.site,
    locale,
    url: new URL('/', options.site.url),
    t: createThemeTranslator(locale),
    image,
    link,
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }

  const pageContent = galleryPreviewPage()
  const fetchedEntries: FetchedEntries = {
    [GALLERY_PREVIEW_COLLECTION_LIST_KEY]: galleryPreviewEntries(locale),
  }
  const bodyHtml = serialize(theme.renderPage(pageContent, themeContext, fetchedEntries))

  const brandingHtml = renderFooterBranding(
    await brandingFor(options.branding),
    DEFAULT_IMAGE_ENDPOINT,
  )
  const chrome = theme.renderChrome({
    site: options.site,
    locale,
    homeHref: '/',
    headerNav: GALLERY_PREVIEW_HEADER_NAV,
    footerNav: GALLERY_PREVIEW_FOOTER_NAV,
    brandingHtml,
    tagline: GALLERY_PREVIEW_TAGLINE,
    social: GALLERY_PREVIEW_SOCIAL,
    footerNote: GALLERY_PREVIEW_FOOTER_NOTE,
    headerAction: GALLERY_PREVIEW_HEADER_ACTION,
  })

  return `<!doctype html>
<html lang="${escapeAttribute(locale)}" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(pageContent.title)}</title>
${options.styles === null ? '' : `<style>${options.styles}</style>`}
</head>
<body>
<a class="cg-skip-link" href="#cg-main">Skip to content</a>
${chrome.header}
${bodyHtml}
${chrome.footer}
</body>
</html>
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * The public wait page for maintenance mode (fiche 24 task 5) — deliberately
 * theme-agnostic (no skin, no block, no `RenderContext`): a site down for
 * maintenance may be down for exactly the reason its theme cannot render, so
 * this page must stand on its own, unstyled beyond a few inline rules.
 */
export function renderMaintenancePage(siteName: string, message: string | null): string {
  const body =
    message === null ? 'We are performing scheduled maintenance. Please check back soon.' : message
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(siteName)} — Maintenance</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}h1{font-size:1.25rem}</style>
</head>
<body>
<h1>${escapeHtml(siteName)}</h1>
<p>${escapeHtml(body)}</p>
</body>
</html>
`
}
