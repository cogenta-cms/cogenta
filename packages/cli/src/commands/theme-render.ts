import {
  type AccessContext,
  type ContentGateway,
  collectDependencies,
  type Filter,
  type MenuRouter,
  type QueryRequest,
} from '@cogenta/api'
import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import { describeMedia, type MediaAsset as RenderMediaAsset, renderSkin } from '@cogenta/render'
import {
  type BlockZones,
  buildPath,
  type CollectionDefinition,
  type ContentEntry,
  matchPath,
} from '@cogenta/schema'
import type { SeoImage } from '@cogenta/seo'
import {
  query as collectionListQuery,
  escapeAttribute,
  escapeText,
  type FetchedEntries,
  type LinkTargetInput,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
  type Page as ThemePage,
  type QueryRequest as ThemeQueryRequest,
} from '@cogenta/theme-canonical'
import { alternatesForEntry, renderSeoHead, seoSiteFor } from './seo.js'
import { minifyCss } from './theme-css.js'

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

function entryTitle(entry: ContentEntry): string {
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
  options: ThemeRenderOptions,
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
  options: ThemeRenderOptions,
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
  options: ThemeRenderOptions,
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
  options: ThemeRenderOptions,
  context: AccessContext,
): Promise<readonly ResolvedMenuLink[] | null> {
  const byLocation = await fetchMenuLinksByLocation(location, locale, options, context)
  if (byLocation !== null) return byLocation
  return fetchMenuLinksByName(legacyName, locale, options, context)
}

/**
 * A flat list of links (task 2's documented MVP): every item of the menu, in
 * the order the store returns them, regardless of `parent`/`depth`. A real
 * sub-menu render is left for later — the hierarchy is already in the data
 * (`parent`, `depth`), so nothing here would need to change to add it, only
 * this function's markup.
 *
 * A dead link is **hidden, never served** (fiche 09, task 4's decision): an
 * `entry`/`taxonomy`/`home` item whose target did not resolve to a public
 * route is dropped from the render entirely, on the theory that a menu
 * pointing at a 404 is worse than a menu with one fewer item — the same
 * distinction the admin's health check exists to catch *before* a visitor
 * hits it. A `submenu-placeholder` is not a dead link — it never had a
 * target — so it keeps rendering as an unlinked heading, exactly as before.
 *
 * `null`/empty renders nothing: the caller's slot stays exactly as empty as
 * it was before this was wired, for a site with no menu in that slot.
 */
function renderMenuLinks(links: readonly ResolvedMenuLink[] | null): string {
  if (links === null || links.length === 0) return ''
  const items = links
    .filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
    .map((link) => {
      const label = escapeText(link.label)
      const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
      if (link.href === null) return `<li><span${titleAttr}>${label}</span></li>`
      const href = escapeAttribute(link.href)
      const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
      return `<li><a href="${href}"${target}${titleAttr}>${label}</a></li>`
    })
    .join('')
  return items === '' ? '' : `<ul class="cg-menu">${items}</ul>`
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
async function resolveEntry(
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
    return buildPath(
      targetCollection,
      Object.fromEntries(
        Object.entries(found.values).filter(
          (pair): pair is [string, string] => typeof pair[1] === 'string',
        ),
      ),
      found.locale ?? undefined,
    )
  }

  const themeContext: RenderContext = {
    site: options.site,
    locale: entry.locale,
    url: new URL(pathname, options.site.url),
    t: (key) => key,
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

  const pageContent: PageContent = { title: entryTitle(entry), blocks }
  const node = renderPage(pageContent, themeContext, fetchedEntries as FetchedEntries)
  const bodyHtml = serialize(node)

  // The head is `@cogenta/seo`'s, not this file's: title, description,
  // canonical, hreflang, Open Graph, Twitter Card and JSON-LD, all derived
  // from the real entry and the real collection (L10 task 1). Nothing here
  // decides what is indexable — `buildMetaTags` asks `isPublished` itself, so
  // a preview render carries `noindex` without this caller remembering to.
  const seoSite = seoSiteFor(options.site)
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
  const head = renderSeoHead(seoSite, resource, {
    ...(alternates.length === 0 ? {} : { alternates }),
    ...(mediaAssets.size === 0 ? {} : { media: seoMedia }),
  })

  const siteName = escapeAttribute(options.site.name)

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
  const headerNav = renderMenuLinks(headerMenu)
  const footerNav = renderMenuLinks(footerMenu)

  // The same frame `Base.astro` builds for a real Astro build: a skip link
  // first, the site name as a header, the content, a footer. Rendering the
  // `<main>` alone — which this did until the theme's own stylesheet started
  // being served — left every page with no landmark to skip to and no way back
  // to the home page.
  return `<!doctype html>
<html lang="${themeContext.locale}" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${head}
${options.styles === null ? '' : `<link rel="stylesheet" href="${STYLESHEET_PATH}">`}
</head>
<body>
<a class="cg-skip-link" href="#cg-main">Skip to content</a>
<header class="cg-site-header"><div class="cg-site-header__inner"><a class="cg-site-header__home" href="/">${siteName}</a>${headerNav === '' ? '' : `<nav class="cg-site-header__nav" aria-label="Primary">${headerNav}</nav>`}</div></header>
${bodyHtml}
<footer class="cg-site-footer"><div class="cg-site-footer__inner"><span>${siteName}</span>${footerNav === '' ? '' : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNav}</nav>`}</div></footer>
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
