import { CogentaError } from '@cogenta/core'
import {
  buildExcerpt,
  CONTENT_STATUSES,
  type CollectionDefinition,
  type ContentStatus,
  queryTokens,
  type SearchDriver,
  type SearchHit,
  searchDocumentFor,
} from '@cogenta/schema'
import type { ContentGateway } from '../graphql/gateway.js'
import type { AccessContext, PermissionLayer } from '../types.js'
import { ANONYMOUS } from '../types.js'
import {
  errorResponse,
  jsonResponse,
  queryError,
  type RestRequest,
  type RestResponse,
} from './http.js'
import { single } from './query.js'

/**
 * A `SearchHit` plus the two things the driver's own storage cannot answer:
 * an excerpt in real casing and accents (task 3), and the timestamps a search
 * results page needs to sort or filter by date — `SearchHit` has neither, on
 * purpose, since the index only ever stores the folded, extracted text.
 */
export interface SearchResultHit extends SearchHit {
  readonly excerpt: string
  readonly highlights: readonly { readonly start: number; readonly end: number }[]
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

/**
 * `GET /api/search` — the full-text index, finally reachable (L10 task 3).
 *
 * The engine (`packages/schema/src/search/`, one driver per database) was
 * written and tested in L1 and no route ever called it. This is that route,
 * and it is deliberately thin: the driver already refuses to cross a locale or
 * a state, `normaliseQuery` already caps the page size and the offset, so what
 * is left here is the part neither of them can know — **which collections this
 * actor may read**.
 *
 * Two gates, in this order:
 *
 * 1. A collection named in `?collections=` is asserted, so asking for one you
 *    may not read is an honest 403 rather than a silently narrower answer.
 * 2. The scope, named or default, is then reduced to the readable collections
 *    and every hit is filtered against that same set on the way out. The
 *    second pass is not redundant: it is what makes "a collection you may not
 *    read never appears in a result list" a property of the response rather
 *    than of the query having been built correctly.
 *
 * Reaching anything other than `published` needs `canReadUnpublished` on every
 * collection in scope — the same permission `state=working` needs on
 * `/api/content`, asked here rather than assumed, because a search over drafts
 * is a draft read by another name.
 */

export interface SearchRouterOptions {
  readonly index: SearchDriver
  readonly collections: readonly CollectionDefinition[]
  readonly permissions: PermissionLayer
  /** The locale a query with no `locale` parameter is answered in. */
  readonly defaultLocale?: string
  /** Mount point. `/api/search` by default. */
  readonly basePath?: string
  /**
   * Reads the live entry behind each hit to build its excerpt (task 3).
   *
   * Optional, and deliberately so: the route still answers without it — every
   * existing caller of `createSearchRouter` keeps compiling and every prior
   * test keeps passing — it only gains an `excerpt`/`highlights`/timestamps
   * of `''`/`[]`/`null`. Re-reading through the gateway rather than the index
   * itself is the point: the index stores folded text for matching, never the
   * cased, accented prose a result list should show (`buildExcerpt`'s own
   * comment), and the gateway is the one place that already knows how to ask
   * a `ContentStore` for one entry under this exact actor's permissions.
   */
  readonly gateway?: ContentGateway
}

export interface SearchRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/search'

/** Longer than this is not a query, it is an attempt to make the engine work. */
const MAX_QUERY_LENGTH = 200

export function createSearchRouter(options: SearchRouterOptions): SearchRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const byName = new Map(options.collections.map((collection) => [collection.name, collection]))
  const defaultLocale = options.defaultLocale ?? 'en'

  function collection(name: string): CollectionDefinition {
    const found = byName.get(name)
    if (found !== undefined) return found
    // Same silence as every other route: a 404 body is logged and cached, and
    // nothing a caller typed belongs in either.
    throw new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: 'This collection does not exist.',
      hint: 'Search one of the collections the schema declares, or leave `collections` out to search all of them.',
    })
  }

  /** The collections in scope, already narrowed to what this actor may read. */
  function scopeFor(
    requested: readonly string[],
    context: AccessContext,
  ): readonly CollectionDefinition[] {
    if (requested.length > 0) {
      return requested.map((name) => {
        const target = collection(name)
        options.permissions.assert('read', target, context)
        return target
      })
    }
    return options.collections.filter(
      (candidate) => options.permissions.can('read', candidate, context).allowed,
    )
  }

  function parseStatus(request: RestRequest): ContentStatus | undefined {
    const raw = single(request.query, 'status')
    if (raw === undefined) return undefined
    if (!(CONTENT_STATUSES as readonly string[]).includes(raw)) {
      throw queryError(
        'status',
        'is not a content status',
        `Use one of: ${CONTENT_STATUSES.join(', ')}.`,
      )
    }
    return raw as ContentStatus
  }

  function parseCount(request: RestRequest, key: 'limit' | 'offset'): number | undefined {
    const raw = single(request.query, key)
    if (raw === undefined) return undefined
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 0) {
      throw queryError(key, 'is not a whole number of zero or more', 'Pass a plain integer.')
    }
    return value
  }

  /** `?collections=a,b` and `?collections=a&collections=b` both work. */
  function parseCollections(request: RestRequest): readonly string[] {
    const raw = request.query['collections']
    const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : [...raw]
    return values
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  }

  async function search(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const text = single(request.query, 'q')
    if (text === undefined || text.trim().length === 0) {
      throw queryError('q', 'is required', 'Pass the text to search for, for example q=cathedral.')
    }
    if (text.length > MAX_QUERY_LENGTH) {
      throw queryError(
        'q',
        `is longer than the ${MAX_QUERY_LENGTH} characters this route accepts`,
        'Search for fewer words.',
      )
    }

    const scope = scopeFor(parseCollections(request), context)
    const status = parseStatus(request)

    if (status !== undefined && status !== 'published') {
      for (const target of scope) {
        const decision = options.permissions.canReadUnpublished(target, context)
        if (!decision.allowed) {
          throw new CogentaError({
            code: 'FORBIDDEN',
            message: 'You may not search unpublished content.',
            hint: 'Drop the `status` parameter to search published content, or sign in with a role that may read drafts.',
          })
        }
      }
    }

    // No readable collection at all: an empty result, not a 403. The actor is
    // allowed to ask; there is simply nothing in scope, and saying which
    // collections exist would be the disclosure.
    if (scope.length === 0) {
      return jsonResponse(200, {
        data: [],
        page: { hasMore: false, nextOffset: null },
      })
    }

    const limit = parseCount(request, 'limit')
    const offset = parseCount(request, 'offset')

    const results = await options.index.search({
      text,
      locale: single(request.query, 'locale') ?? defaultLocale,
      collections: scope.map((target) => target.name),
      ...(status === undefined ? {} : { status }),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    })

    const readable = new Set(scope.map((target) => target.name))
    const hits: readonly SearchHit[] = results.hits.filter((hit) => readable.has(hit.collection))

    const tokens = queryTokens(text)
    const enriched = await Promise.all(hits.map((hit) => enrich(hit, tokens, context)))

    return jsonResponse(200, {
      data: enriched,
      page: { hasMore: results.hasMore, nextOffset: results.nextOffset },
    })
  }

  /**
   * A hit as the wire sends it: `excerpt`/`highlights` from the live entry
   * when a `gateway` was supplied, `''`/`[]`/`null` otherwise or when the
   * entry has since become unreadable — a hit the index has not caught up to
   * yet is not this route's failure to report.
   */
  async function enrich(
    hit: SearchHit,
    tokens: readonly string[],
    context: AccessContext,
  ): Promise<SearchResultHit> {
    const empty: SearchResultHit = {
      ...hit,
      excerpt: '',
      highlights: [],
      createdAt: null,
      updatedAt: null,
    }
    if (options.gateway === undefined) return empty

    let entry: Awaited<ReturnType<ContentGateway['read']>>
    try {
      entry = await options.gateway.read(hit.collection, hit.id, context)
    } catch {
      // A permission the index-scope check already granted can still be
      // refused a second time by the gateway's own entry-level grant logic
      // (a one-entry grant revoked since the hit was indexed, say) — that is
      // this entry quietly missing an excerpt, never the whole search failing.
      return empty
    }
    if (entry === null) return empty

    const document = searchDocumentFor(collection(hit.collection), entry)
    const { text: excerpt, matches } = buildExcerpt(document.body, tokens)
    return {
      ...hit,
      excerpt,
      highlights: matches,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        if (normalise(request.path.split('?')[0] ?? request.path) !== basePath) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'The search route is GET /api/search?q=…',
          })
        }
        if (request.method.toUpperCase() !== 'GET') {
          return {
            status: 405,
            body: {
              error: {
                code: 'QUERY_INVALID',
                message: 'This method is not allowed on this route.',
                hint: 'Use GET.',
              },
            },
            headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET' },
          }
        }
        return await search(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
