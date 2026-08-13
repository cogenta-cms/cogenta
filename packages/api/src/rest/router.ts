import type { BlockRegistry } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import type { SerialisedEntry } from '../content/index.js'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { parseCreateBody, parseRestoreBody, parseUpdateBody } from './body.js'
import type { ContentService } from './content-service.js'
import type { DependencySource, ResponseDependencies } from './dependencies.js'
import { collectDependencies } from './dependencies.js'
import {
  errorResponse,
  jsonResponse,
  queryError,
  type RestRequest,
  type RestResponse,
} from './http.js'
import { parseListQuery, parsePositiveInteger, parseReadQuery, single } from './query.js'

/**
 * The REST transport.
 *
 * A request in, a response out — no framework, no port, no `process.exit`. The
 * router owns paths, methods and status codes and nothing else: every decision
 * that REST and GraphQL must agree on already happened in `ContentService`.
 *
 *   GET    /-/by-path                      resolve a site URL
 *   GET    /{collection}                   list
 *   POST   /{collection}                   create
 *   GET    /{collection}/{id}              read
 *   PATCH  /{collection}/{id}              update
 *   DELETE /{collection}/{id}              delete
 *   POST   /{collection}/{id}/publish      publish
 *   GET    /{collection}/{id}/history      version list
 *   GET    /{collection}/{id}/diff         diff of two versions
 *   POST   /{collection}/{id}/restore      restore a version
 */

export interface RestRouterOptions {
  readonly service: ContentService
  /**
   * The blocks a response's media references are read through. Defaults to the
   * twelve of contract B; a site with its own blocks passes its registry.
   */
  readonly blocks?: BlockRegistry
  /**
   * Mount point. `/api/content` by default rather than `/api`, so that a
   * collection can be named `graphql` without shadowing the other transport.
   */
  readonly basePath?: string
}

export interface RestRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/content'

/** The segment engine routes live under. No collection name may contain a hyphen alone. */
const RESERVED_SEGMENT = '-'

/**
 * Longest URL this route will try to resolve.
 *
 * A redirect path is stored in a `varchar(512)`, and a route match walks
 * segments, so an unbounded string here is free work for anyone who sends one.
 */
const MAX_PATH_LENGTH = 1_024

/** The `path` parameter: required, one value, and a site path rather than a URL. */
function parsePath(query: RestRequest['query']): string {
  const raw = single(query, 'path')
  if (raw === undefined || raw.length === 0) {
    throw queryError(
      'path',
      'is required',
      'Pass the site path to resolve, for example path=/blog/hello.',
    )
  }
  if (raw.length > MAX_PATH_LENGTH) {
    throw queryError(
      'path',
      'is longer than this API resolves',
      `Site paths are at most ${MAX_PATH_LENGTH} characters.`,
    )
  }
  // An absolute URL would make "which site is this?" a question this route
  // cannot answer, and `//host/path` is a protocol-relative URL in disguise.
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    throw queryError(
      'path',
      'is not a site path',
      'Pass a path beginning with a single "/", not an absolute or protocol-relative URL.',
    )
  }
  return raw
}

export function createRestRouter(options: RestRouterOptions): RestRouter {
  const service = options.service
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const dependencySource: DependencySource = {
    collection: (name) => service.definition(name),
    ...(options.blocks === undefined ? {} : { blocks: options.blocks }),
  }

  /**
   * What a read response was built from, alongside what it returned.
   *
   * Only the read routes carry it. A cache tags what it stores, and it stores
   * answers to reads; a create or a publish is the event that *invalidates*
   * those tags, so declaring dependencies on it would describe nothing.
   */
  function meta(
    entries: readonly SerialisedEntry[],
    queried: readonly string[],
  ): { readonly dependencies: ResponseDependencies } {
    return { dependencies: collectDependencies(entries, dependencySource, queried) }
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const segments = segmentsOf(request.path, basePath)
    if (segments === null || segments.length === 0 || segments.length > 3) throw noRoute()

    const method = request.method.toUpperCase()
    const [name, id, action] = segments

    // Fails before anything else so that an unknown collection is a 404 rather
    // than a permission decision about a collection that does not exist.
    if (name === undefined) throw noRoute()

    // Before the collection lookup, and under a segment `-` that no collection
    // name can take: engine routes have to live somewhere, and shadowing a
    // collection called `by-path` would be a worse trade than reserving one
    // character.
    if (name === RESERVED_SEGMENT) return engineRoute(request, context, method, id, action)

    service.collection(name)

    if (id === undefined) {
      if (method === 'GET') {
        const query = parseListQuery(request.query, service.collection(name), service.limits)
        const page = await service.list(context, name, query)
        return jsonResponse(200, {
          data: page.items,
          page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
          meta: meta(page.items, [name]),
        })
      }
      if (method === 'POST') {
        const read = parseReadQuery(request.query, service.limits)
        const input = parseCreateBody(request.body, context.actor)
        const entry = await service.create(context, name, input, {
          state: 'working',
          depth: read.depth,
        })
        return jsonResponse(201, { data: entry })
      }
      return methodNotAllowed(['GET', 'POST'])
    }

    if (action === undefined) {
      const read = parseReadQuery(request.query, service.limits)

      if (method === 'GET') {
        const entry = await service.read(context, name, id, {
          state: read.requestedState,
          depth: read.depth,
        })
        return jsonResponse(200, { data: entry, meta: meta([entry], [name]) })
      }
      if (method === 'PATCH' || method === 'PUT') {
        const input = parseUpdateBody(request.body, context.actor)
        const entry = await service.update(context, name, id, input, {
          state: 'working',
          depth: read.depth,
        })
        return jsonResponse(200, { data: entry })
      }
      if (method === 'DELETE') {
        await service.remove(context, name, id)
        return jsonResponse(204, null)
      }
      return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
    }

    return subroute(request, context, method, name, id, action)
  }

  /**
   * The routes that belong to the engine rather than to a collection.
   *
   * Only `by-path` today. It answers the one question the renderer can ask —
   * "what is served at this URL?" — and it answers all three outcomes, because a
   * renderer that only learns "entry or nothing" cannot serve the 301 a rename
   * created, and every old link dies at the next rename.
   */
  async function engineRoute(
    request: RestRequest,
    context: AccessContext,
    method: string,
    name: string | undefined,
    extra: string | undefined,
  ): Promise<RestResponse> {
    if (name !== 'by-path' || extra !== undefined) throw noRoute()
    if (method !== 'GET') return methodNotAllowed(['GET'])

    const path = parsePath(request.query)
    const read = parseReadQuery(request.query, service.limits)
    const resolution = await service.resolvePath(context, path, {
      state: read.requestedState,
      depth: read.depth,
    })

    if (resolution.kind === 'notFound') {
      throw new CogentaError({
        code: 'CONTENT_NOT_FOUND',
        message: 'Nothing is served at this path.',
        hint: 'Check the path against the routing pattern of the collection, including its locale prefix. An unpublished entry has no public URL.',
      })
    }

    // A redirect is a 200 describing one, not a 3xx performing one: the status
    // in the body is what the *site* must serve its visitor, and moving it into
    // the API response would have the renderer's own HTTP client follow it back
    // into the API instead of handing it to the browser.
    if (resolution.kind === 'redirect') {
      return jsonResponse(200, {
        data: null,
        redirect: { to: resolution.to, status: resolution.status },
      })
    }

    return jsonResponse(200, {
      data: resolution.entry,
      route: {
        collection: resolution.collection,
        locale: resolution.locale,
        params: resolution.params,
      },
      meta: meta([resolution.entry], [resolution.collection]),
    })
  }

  async function subroute(
    request: RestRequest,
    context: AccessContext,
    method: string,
    name: string,
    id: string,
    action: string,
  ): Promise<RestResponse> {
    const read = parseReadQuery(request.query, service.limits)

    switch (action) {
      case 'publish': {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        const entry = await service.publish(
          context,
          name,
          id,
          { publishedBy: context.actor.id },
          { state: 'published', depth: read.depth },
        )
        return jsonResponse(200, { data: entry })
      }

      case 'history': {
        if (method !== 'GET') return methodNotAllowed(['GET'])
        return jsonResponse(200, { data: await service.history(context, name, id) })
      }

      case 'diff': {
        if (method !== 'GET') return methodNotAllowed(['GET'])
        const from = parsePositiveInteger(request.query, 'from')
        const to = parsePositiveInteger(request.query, 'to')
        return jsonResponse(200, { data: await service.diff(context, name, id, from, to) })
      }

      case 'restore': {
        if (method !== 'POST') return methodNotAllowed(['POST'])
        const version = parseRestoreBody(request.body)
        const entry = await service.restore(context, name, id, version, {
          state: 'working',
          depth: read.depth,
        })
        return jsonResponse(200, { data: entry })
      }

      default:
        throw noRoute()
    }
  }
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
    hint: 'Content routes are /{collection}, /{collection}/{id} and /{collection}/{id}/{publish|history|diff|restore}.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/** Path segments below the mount point, or null when the path is elsewhere. */
function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null

  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}
