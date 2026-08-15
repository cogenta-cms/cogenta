import {
  type AccessContext,
  type ContentGateway,
  collectDependencies,
  type Filter,
  type QueryRequest,
} from '@cogenta/api'
import type { VocabularyBlock } from '@cogenta/blocks'
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
}

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

function entryTitle(entry: ContentEntry): string {
  const value = entry.values['title']
  return typeof value === 'string' && value.trim() !== '' ? value : entry.id
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
 * `/:slug`, which needs a real segment) — every `create-cogenta` blueprint
 * seeds its home page at the real, consistent slug `home`, so `/` retries
 * once as `/home` rather than 404ing on the one URL a real visitor always
 * tries first. Not a magic redirect: a site with no page at that slug still
 * 404s honestly, exactly like every other unmatched path.
 */
async function resolveEntry(
  pathname: string,
  options: ThemeRenderOptions,
  context: AccessContext,
): Promise<{ readonly collection: CollectionDefinition; readonly entry: ContentEntry } | null> {
  const effectivePath = pathname === '/' ? '/home' : pathname
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

  // Which media this page references, from the same walk `/api/content` uses
  // to declare a response's dependencies (`collectDependencies`): declared
  // `media` fields *and* the media inside every block, resolved through the
  // block registry rather than guessed at from the JSON. A `ContentEntry`
  // plus its collection name is exactly a `SerialisedEntry`, which is why
  // this reuse costs nothing.
  const mediaAssets = new Map<string, RenderMediaAsset>()
  if (options.loadMedia !== undefined) {
    const dependencies = collectDependencies(
      [...knownEntries].map(([id, found]) => ({
        ...found,
        collection: entryCollections.get(id) ?? collection.name,
      })),
      { collection: (name) => collectionsByName.get(name) },
    )
    if (dependencies.media.length > 0) {
      for (const [id, asset] of await options.loadMedia(dependencies.media)) {
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
<header class="cg-site-header"><div class="cg-site-header__inner"><a class="cg-site-header__home" href="/">${siteName}</a></div></header>
${bodyHtml}
<footer class="cg-site-footer"><div class="cg-site-footer__inner">${siteName}</div></footer>
</body>
</html>
`
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
