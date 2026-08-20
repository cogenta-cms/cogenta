import { CogentaError, isCogentaError } from '@cogenta/core'
import type { CollectionDefinition, ContentEntry } from '@cogenta/schema'
import {
  buildMetaTags,
  isIndexable,
  isPublished,
  isSeoNoindexed,
  type MetadataOptions,
  type MetaTag,
  renderRobotsTxt,
  type SeoImage,
  type SeoResource,
  type SeoSite,
} from '@cogenta/seo'
import type { ContentGateway } from '../graphql/gateway.js'
import type { AccessContext, PermissionLayer } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/seo` — fiche 13 (SEO éditorial): the admin's only door onto what
 * `@cogenta/seo` actually computes.
 *
 * Two routes, and the pitfall the fiche names ("un aperçu réimplémenté côté
 * admin ment") is why there are only two: neither one re-derives a title, a
 * description or a robots decision. Both call the exact same
 * `buildMetaTags`/`isIndexable` the public render path calls — `preview` on
 * one entry with the editor's unsaved SEO fields overlaid, `diagnostics`
 * across every routed collection's *stored* published entries.
 *
 *   POST /api/seo/preview       { collection, id, overrides? } → the real head, for one edit in progress
 *   GET  /api/seo/diagnostics   site-wide: sitemap size, robots.txt, and the anomalies a client would otherwise find first
 *
 * `preview` is gated by `update` on the named collection (an editor previews
 * what they may write); `diagnostics` is `admin`-only, matching the site-wide
 * screens elsewhere in this package (`redirect-router.ts`, `ops-status-router.ts`).
 */

export interface SeoRouterOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly gateway: ContentGateway
  readonly permissions: PermissionLayer
  readonly site: SeoSite
  /** Resolves a media id to something a crawler can use. Absent means no image in a preview or a diagnostic. */
  readonly media?: (id: string) => SeoImage | null
  /** `%title% — %site%` composition (fiche 13, Task 3). Threaded straight into `buildMetaTags`. */
  readonly titleTemplate?: string
  readonly collectionTitleTemplates?: Readonly<Record<string, string>>
  /** `false` blocks every crawler outright — a staging safeguard, mirrored in the diagnostic as a loud warning. Defaults to `true`. */
  readonly allowIndexing?: boolean
  /** Mount point. `/api/seo` by default. */
  readonly basePath?: string
  /** How many entries a diagnostic scan reads per collection before it stops counting. */
  readonly maxScanPerCollection?: number
}

export interface SeoRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/seo'
const DEFAULT_MAX_SCAN = 5_000
const SCAN_PAGE = 100

/** Google truncates a rendered title near this width; longer is a real, visible clip. */
const RECOMMENDED_MAX_TITLE = 60

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The SEO routes are POST /api/seo/preview and GET /api/seo/diagnostics.',
  })
}

function forbiddenAdmin(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: the SEO diagnostic screen can only be read by the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext): void {
  if (context.actor.roles.includes('admin')) return
  throw forbiddenAdmin(context)
}

function tagContent(tags: readonly MetaTag[], key: string): string | undefined {
  for (const tag of tags) {
    if (tag.kind === 'meta' && tag.name === key) return tag.content
    if (tag.kind === 'property' && tag.property === key) return tag.content
  }
  return undefined
}

function tagTitle(tags: readonly MetaTag[]): string {
  return tags.find((tag) => tag.kind === 'title')?.text ?? ''
}

function tagCanonical(tags: readonly MetaTag[]): string | null {
  const link = tags.find((tag) => tag.kind === 'link' && tag.rel === 'canonical')
  return link !== undefined && link.kind === 'link' ? link.href : null
}

interface SeoPreviewBody {
  readonly title: string
  readonly titleLength: number
  readonly description: string | null
  readonly descriptionLength: number
  readonly canonical: string | null
  readonly robots: 'index' | 'noindex'
  readonly image: { readonly url: string; readonly alt: string | null } | null
  readonly ogTitle: string
  readonly ogDescription: string | null
}

/** Not exported: a diagnostic-only projection of one collection's routed reach. */
interface CollectionSitemapReport {
  readonly name: string
  readonly included: boolean
  /** Why this collection contributes no URL — `null` when it is included. */
  readonly reason: string | null
  readonly urlCount: number
}

interface DuplicateTitleReport {
  readonly title: string
  readonly entries: readonly { readonly collection: string; readonly id: string }[]
}

interface SeoAnomaly {
  readonly code: string
  readonly message: string
}

export interface SeoDiagnostics {
  readonly generatedAt: string
  readonly sitemap: {
    readonly totalUrls: number
    readonly collections: readonly CollectionSitemapReport[]
  }
  readonly robots: {
    readonly content: string
    readonly allowIndexing: boolean
    readonly disallowsEverything: boolean
  }
  readonly content: {
    readonly publishedCount: number
    readonly noindexCount: number
    readonly missingDescriptionCount: readonly {
      readonly collection: string
      readonly id: string
    }[]
    readonly tooLongTitleCount: readonly { readonly collection: string; readonly id: string }[]
    readonly duplicateTitles: readonly DuplicateTitleReport[]
  }
  readonly anomalies: readonly SeoAnomaly[]
}

export function createSeoRouter(options: SeoRouterOptions): SeoRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const previewPath = `${basePath}/preview`
  const diagnosticsPath = `${basePath}/diagnostics`
  const byName = new Map(options.collections.map((collection) => [collection.name, collection]))
  const maxScan = options.maxScanPerCollection ?? DEFAULT_MAX_SCAN
  const allowIndexing = options.allowIndexing ?? true

  function metadataOptions(): Pick<
    MetadataOptions,
    'titleTemplate' | 'collectionTitleTemplates' | 'resolvers'
  > {
    return {
      ...(options.titleTemplate === undefined ? {} : { titleTemplate: options.titleTemplate }),
      ...(options.collectionTitleTemplates === undefined
        ? {}
        : { collectionTitleTemplates: options.collectionTitleTemplates }),
      ...(options.media === undefined ? {} : { resolvers: { media: options.media } }),
    }
  }

  function collectionOf(name: string): CollectionDefinition {
    const found = byName.get(name)
    if (found !== undefined) return found
    throw new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: 'This collection does not exist.',
      hint: 'Check the collection name against the collections your schema declares.',
    })
  }

  function asRecord(body: unknown): Record<string, unknown> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: 'The request body is not an object.',
        hint: 'Send { "collection": "…", "id": "…" }.',
      })
    }
    return body as Record<string, unknown>
  }

  async function preview(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const body = asRecord(request.body)
    const collectionName = body.collection
    const id = body.id
    if (typeof collectionName !== 'string' || collectionName.length === 0) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: 'This route needs a "collection" name.',
        hint: 'Send { "collection": "article", "id": "…" }.',
      })
    }
    if (typeof id !== 'string' || id.length === 0) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: 'This route needs an "id".',
        hint: 'Send { "collection": "…", "id": "0192f…" }.',
      })
    }
    const overrides = body.overrides
    if (overrides !== undefined && (typeof overrides !== 'object' || overrides === null)) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: '"overrides" must be an object of field values.',
        hint: 'Send the fields the editor changed but has not saved yet, for example { "seoTitle": "…" }.',
      })
    }

    const collection = collectionOf(collectionName)
    // The panel's own gate: an editor previews only what they may write.
    options.permissions.assert('update', collection, context)

    const stored = await options.gateway.read(collectionName, id, context)
    if (stored === null) {
      throw new CogentaError({
        code: 'CONTENT_NOT_FOUND',
        message: 'This entry does not exist, or is not visible to you.',
        hint: 'Check the identifier. An unpublished entry needs read access to its draft.',
      })
    }

    // `gateway.read` hands an editor the entry's `working` face — the same
    // one `renderDraftPage` reads for the page builder's own preview (L16).
    // `buildMetaTags` therefore reports `noindex` and no canonical here,
    // exactly as it does for that preview: an editor is looking at an
    // unsaved copy, not the page a crawler would ever be shown, and this
    // route must not pretend otherwise by forging a "would be published"
    // state `isPublished` never actually saw. Once the entry is really
    // published, this same call returns a real canonical — nothing here
    // changes, only what `stored.state` is.
    const entry: ContentEntry = {
      ...stored,
      values: { ...stored.values, ...((overrides as Record<string, unknown> | undefined) ?? {}) },
    }
    const resource: SeoResource = { collection, entry }
    const tags = buildMetaTags(options.site, resource, metadataOptions())

    const title = tagTitle(tags)
    const description = tagContent(tags, 'description') ?? null
    const canonical = tagCanonical(tags)
    const robots: 'index' | 'noindex' =
      tagContent(tags, 'robots') === undefined ? 'index' : 'noindex'
    const imageUrl = tagContent(tags, 'og:image')
    const imageAlt = tagContent(tags, 'og:image:alt')

    const data: SeoPreviewBody = {
      title,
      titleLength: title.length,
      description,
      descriptionLength: description?.length ?? 0,
      canonical,
      robots,
      image: imageUrl === undefined ? null : { url: imageUrl, alt: imageAlt ?? null },
      ogTitle: tagContent(tags, 'og:title') ?? title,
      ogDescription: tagContent(tags, 'og:description') ?? description,
    }

    return jsonResponse(200, { data })
  }

  /**
   * Every published, routed resource this site could put in a sitemap —
   * `ANONYMOUS`, deliberately, for the same reason `cli`'s own sitemap builder
   * reads `ANONYMOUS`: a diagnostic answers "what would a crawler see", not
   * "what can this admin see", and the two must never silently differ.
   *
   * A collection closed to `public` throws `FORBIDDEN` from `gateway.list`;
   * that is caught and turned into an excluded-with-reason row rather than a
   * 500, mirroring the sitemap route's own handling of the same case (L10
   * task 2's security review).
   */
  async function scanCollection(
    collection: CollectionDefinition,
  ): Promise<{ readonly resources: readonly SeoResource[]; readonly reason: string | null }> {
    if (collection.routing === undefined) {
      return { resources: [], reason: 'This collection declares no route.' }
    }

    const context: AccessContext = { actor: ANONYMOUS }
    const resources: SeoResource[] = []
    try {
      let cursor: string | undefined
      let read = 0
      for (;;) {
        const page = await options.gateway.list(
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
        if (next === null || read >= maxScan) break
        cursor = next
      }
    } catch (error) {
      if (isCogentaError(error) && error.code === 'FORBIDDEN') {
        return { resources: [], reason: 'This collection is not readable by the "public" role.' }
      }
      throw error
    }

    return { resources, reason: null }
  }

  /**
   * The same walk as `scanCollection`, but under the *caller's own* context
   * rather than `ANONYMOUS` — used only for the content-quality half of the
   * diagnostic (missing descriptions, duplicate titles, the anomaly check
   * below), never for the sitemap section.
   *
   * The distinction matters: a collection closed to `public` (an internal
   * memo, say) is correctly excluded from the sitemap, but an admin still
   * wants to know it has ten published entries with no description — and,
   * critically, still wants the anomaly check below to see them. Without this
   * second pass, "every published entry lives in a collection closed to
   * `public`" would report as "nothing published anywhere", the exact
   * opposite of what an admin needs to be told.
   */
  async function scanEntriesAsCaller(
    collection: CollectionDefinition,
    context: AccessContext,
  ): Promise<readonly SeoResource[]> {
    if (collection.routing === undefined) return []
    const resources: SeoResource[] = []
    try {
      let cursor: string | undefined
      let read = 0
      for (;;) {
        const page = await options.gateway.list(
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
        if (next === null || read >= maxScan) break
        cursor = next
      }
    } catch (error) {
      if (isCogentaError(error) && error.code === 'FORBIDDEN') return []
      throw error
    }
    return resources
  }

  async function diagnostics(context: AccessContext): Promise<RestResponse> {
    assertAdmin(context)

    const collectionReports: CollectionSitemapReport[] = []
    const allResources: SeoResource[] = []

    for (const collection of options.collections) {
      const { resources, reason } = await scanCollection(collection)
      const indexableCount = resources.filter((resource) =>
        isIndexable(options.site, resource),
      ).length
      collectionReports.push({
        name: collection.name,
        included: reason === null,
        reason,
        urlCount: indexableCount,
      })

      // The admin asking for this diagnostic already holds an `admin` role,
      // so this second read never narrows what the first one saw — it can
      // only see *more*, exactly the collections the public-facing scan just
      // excluded for a permission reason.
      allResources.push(...(await scanEntriesAsCaller(collection, context)))
    }

    const totalUrls = collectionReports.reduce((sum, report) => sum + report.urlCount, 0)

    const publishedResources = allResources.filter((resource) => isPublished(resource.entry))
    const noindexCount = publishedResources.filter((resource) => isSeoNoindexed(resource)).length

    const missingDescriptionCount: { collection: string; id: string }[] = []
    const tooLongTitleCount: { collection: string; id: string }[] = []
    const titleGroups = new Map<string, { collection: string; id: string }[]>()

    for (const resource of publishedResources) {
      const tags = buildMetaTags(options.site, resource, metadataOptions())
      const title = tagTitle(tags)
      const description = tagContent(tags, 'description')
      const ref = { collection: resource.collection.name, id: resource.entry.id }

      if (description === undefined) missingDescriptionCount.push(ref)
      if (title.length > RECOMMENDED_MAX_TITLE) tooLongTitleCount.push(ref)

      const key = title.trim().toLowerCase()
      if (key.length === 0) continue
      const group = titleGroups.get(key)
      if (group === undefined) titleGroups.set(key, [ref])
      else group.push(ref)
    }

    const duplicateTitles: DuplicateTitleReport[] = []
    for (const [key, entries] of titleGroups) {
      if (entries.length < 2) continue
      const original = publishedResources.find(
        (resource) =>
          resource.entry.id === entries[0]?.id &&
          resource.collection.name === entries[0]?.collection,
      )
      const title =
        original === undefined
          ? key
          : tagTitle(buildMetaTags(options.site, original, metadataOptions()))
      duplicateTitles.push({ title, entries })
    }

    const robotsContent = renderRobotsTxt({
      site: options.site,
      sitemaps: ['/sitemap.xml'],
      groups: [{ userAgent: '*', allow: ['/'], disallow: ['/admin', '/api/'] }],
      allowIndexing,
    })
    const disallowsEverything = !allowIndexing

    const anomalies: SeoAnomaly[] = []
    if (totalUrls === 0 && publishedResources.length > 0) {
      anomalies.push({
        code: 'SITEMAP_EMPTY_WHILE_PUBLISHED',
        message: `${publishedResources.length} entr${publishedResources.length === 1 ? 'y is' : 'ies are'} published, but the sitemap would list 0 URLs. Check each collection's routing and its "public" read permission.`,
      })
    }
    if (disallowsEverything) {
      anomalies.push({
        code: 'ROBOTS_DISALLOWS_EVERYTHING',
        message:
          'robots.txt currently blocks every crawler ("Disallow: /"). If this site is meant to be public, switch indexing back on.',
      })
    }

    const data: SeoDiagnostics = {
      generatedAt: new Date().toISOString(),
      sitemap: { totalUrls, collections: collectionReports },
      robots: { content: robotsContent, allowIndexing, disallowsEverything },
      content: {
        publishedCount: publishedResources.length,
        noindexCount,
        missingDescriptionCount,
        tooLongTitleCount,
        duplicateTitles,
      },
      anomalies,
    }

    return jsonResponse(200, { data })
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        const path = normalise(request.path.split('?')[0] ?? request.path)
        const method = request.method.toUpperCase()

        if (path === previewPath) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          return await preview(request, context)
        }
        if (path === diagnosticsPath) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          return await diagnostics(context)
        }
        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
