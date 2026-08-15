import type { AccessContext, ContentGateway, Filter, QueryRequest } from '@cogenta/api'
import type { VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import { renderSkin } from '@cogenta/render'
import { buildPath, type CollectionDefinition, type ContentEntry, matchPath } from '@cogenta/schema'
import type { SeoImage } from '@cogenta/seo'
import {
  query as collectionListQuery,
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

export interface ThemeRenderOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly gateway: ContentGateway
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  /** `null` when the project has no `theme.tokens.json` — served unstyled rather than refused. */
  readonly skinCss: string | null
  /**
   * Resolves a media id to a publishable image, for `og:image` and JSON-LD.
   *
   * Synchronous because `@cogenta/seo`'s `SeoResolvers.media` is: it is asked
   * from inside a pure tag builder. `serve.ts` pre-loads the assets a render
   * needs and hands a lookup over that map — see `mediaResolverFor`.
   */
  readonly media?: (id: string) => SeoImage | null
}

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
  const { collection, entry } = resolved

  const blocks = toVocabularyBlocks(entry, collection)

  // Every entry a `collectionList` block needs is fetched up front — the
  // theme's own contract (`FetchedEntries`, `render-block.ts`) requires it:
  // `renderBlock` is a pure, synchronous function, so nothing inside it can
  // await a query, and `link()` below must resolve an id to a URL without one
  // either.
  const fetchedEntries: Record<string, readonly ThemeContentEntry[]> = {}
  const knownEntries = new Map<string, ContentEntry>([[entry.id, entry]])
  for (const block of blocks) {
    if (block._type !== 'collectionList') continue
    const themeQuery = collectionListQuery(block)
    const results = await options.gateway.list(toApiQueryRequest(themeQuery), context)
    fetchedEntries[block._key] = results.items.map((found) =>
      toThemeEntry(found, themeQuery.collection),
    )
    for (const found of results.items) knownEntries.set(found.id, found)
  }

  const collectionsByName = new Map(options.collections.map((entry) => [entry.name, entry]))

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
    // No image pipeline exists yet (`@cogenta/render`'s `images/`) wired to
    // this in-process path — a theme that asks for one gets a clear refusal,
    // not a broken <img>.
    image: () => {
      throw new CogentaError({
        code: 'THEME_IMAGE_UNSUPPORTED',
        message: 'cogenta serve cannot render images yet.',
        hint: 'No image pipeline is wired into this in-process rendering fallback (no real Astro build exists yet). Avoid mediaFigure/gallery blocks until it is.',
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
  const head = renderSeoHead(seoSite, resource, {
    ...(alternates.length === 0 ? {} : { alternates }),
    ...(options.media === undefined ? {} : { media: options.media }),
  })

  return `<!doctype html>
<html lang="${themeContext.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
${options.skinCss === null ? '' : `<style>${options.skinCss}</style>`}
</head>
<body>
${bodyHtml}
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
