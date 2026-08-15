import { CogentaError } from '@cogenta/core'
import type { TaxonomyDefinition, TaxonomyStore, TaxonomyTerm } from '@cogenta/schema'
import type { AccessContext, PermissionLayer } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * The taxonomy transport (`schema@2.0`, ADR-0022).
 *
 *   GET    /{taxonomy}                the whole tree, in tree order
 *   POST   /{taxonomy}                create a term
 *   GET    /{taxonomy}/{id}           one term
 *   PATCH  /{taxonomy}/{id}           rename, relabel, reorder
 *   DELETE /{taxonomy}/{id}           delete a term (?cascade=true for the branch)
 *   POST   /{taxonomy}/{id}/move      re-parent it
 *
 * Mounted apart from `/api/content` because a taxonomy is **not** a
 * collection: sharing the mount point would make `/api/content/category`
 * ambiguous the day a site has both, which is exactly the case ADR-0022
 * expects (the same "Cuisine" on articles and on recipes).
 *
 * Every route goes through `permissions.assertTerm`, which is the taxonomy's
 * own door in the one permission layer — never a check written inside a
 * handler (R4).
 */

export interface TaxonomyRouterOptions {
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly permissions: PermissionLayer
  readonly storeFor: (taxonomy: TaxonomyDefinition) => TaxonomyStore
  /** Mount point. `/api/taxonomies` by default. */
  readonly basePath?: string
}

export interface TaxonomyRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/taxonomies'

/** What a term looks like on the wire. The stored shape, nothing added. */
interface SerialisedTerm {
  readonly id: string
  readonly taxonomy: string
  readonly parent: string | null
  readonly slug: string
  readonly labels: Readonly<Record<string, string>>
  readonly position: number
  readonly depth: number
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * `path` is deliberately **not** serialised.
 *
 * It is a storage detail of the materialised path, and a client that learned
 * to parse it would be coupled to a decision ADR-0022 took for the database's
 * sake. `parent` and `depth` say everything a tree renderer needs.
 */
function serialise(term: TaxonomyTerm): SerialisedTerm {
  return {
    id: term.id,
    taxonomy: term.taxonomy,
    parent: term.parent,
    slug: term.slug,
    labels: term.labels,
    position: term.position,
    depth: term.depth,
    createdAt: term.createdAt,
    updatedAt: term.updatedAt,
  }
}

function invalidBody(what: string, hint: string): CogentaError {
  return new CogentaError({ code: 'CONTENT_INVALID', message: what, hint })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function requiredSlug(body: Record<string, unknown>): string {
  const slug = body['slug']
  if (typeof slug !== 'string' || slug.length === 0) {
    throw invalidBody('A term needs a slug.', 'Send { "slug": "cuisine", "labels": { … } }.')
  }
  return slug
}

/** Labels are per locale, and that is checked here rather than trusted. */
function requiredLabels(body: Record<string, unknown>): Record<string, string> {
  const raw = body['labels']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalidBody(
      'A term needs labels indexed by locale.',
      'Send { "labels": { "fr": "Cuisine", "en": "Cooking" } }.',
    )
  }

  const labels: Record<string, string> = {}
  for (const [locale, label] of Object.entries(raw)) {
    if (typeof label !== 'string' || label === '') {
      throw invalidBody(
        `The label for "${locale}" is not a non-empty string.`,
        'Every label is text; drop the locale instead of sending an empty one.',
      )
    }
    labels[locale] = label
  }

  if (Object.keys(labels).length === 0) {
    throw invalidBody('A term needs a label in at least one locale.', 'Send at least one.')
  }
  return labels
}

function optionalParent(body: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(body, 'parent')) return undefined
  const parent = body['parent']
  if (parent === null) return null
  if (typeof parent === 'string' && parent.length > 0) return parent
  throw invalidBody(
    'The parent of a term is a term id, or null at the root.',
    'Send "parent": null for a root term.',
  )
}

export function createTaxonomyRouter(options: TaxonomyRouterOptions): TaxonomyRouter {
  const { permissions } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const byName = new Map(options.taxonomies.map((taxonomy) => [taxonomy.name, taxonomy]))

  function definition(name: string): TaxonomyDefinition {
    const found = byName.get(name)
    if (found !== undefined) return found
    throw new CogentaError({
      code: 'TAXONOMY_UNKNOWN',
      message: `This site declares no taxonomy called "${name}".`,
      hint: 'Check the name against the taxonomies passed to defineTaxonomy().',
      details: { taxonomy: name },
    })
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
    if (name === undefined) throw noRoute()

    const taxonomy = definition(name)
    const store = options.storeFor(taxonomy)

    if (id === undefined) {
      if (method === 'GET') {
        permissions.assertTerm('read', taxonomy, context)
        const under = single(request.query, 'under')
        const terms = under === undefined ? await store.list() : await store.list({ under })
        return jsonResponse(200, { data: terms.map(serialise) })
      }
      if (method === 'POST') {
        permissions.assertTerm('create', taxonomy, context)
        const body = asRecord(request.body)
        const parent = optionalParent(body)
        const term = await store.create({
          slug: requiredSlug(body),
          labels: requiredLabels(body),
          ...(parent === undefined ? {} : { parent }),
        })
        return jsonResponse(201, { data: serialise(term) })
      }
      return methodNotAllowed(['GET', 'POST'])
    }

    if (action === undefined) {
      if (method === 'GET') {
        permissions.assertTerm('read', taxonomy, context)
        const term = await store.read(id)
        if (term === null) throw termNotFound(taxonomy.name, id)
        return jsonResponse(200, { data: serialise(term) })
      }
      if (method === 'PATCH' || method === 'PUT') {
        permissions.assertTerm('update', taxonomy, context)
        const body = asRecord(request.body)
        const term = await store.update(id, {
          ...(Object.hasOwn(body, 'slug') ? { slug: requiredSlug(body) } : {}),
          ...(Object.hasOwn(body, 'labels') ? { labels: requiredLabels(body) } : {}),
          ...(typeof body['position'] === 'number' ? { position: body['position'] } : {}),
        })
        return jsonResponse(200, { data: serialise(term) })
      }
      if (method === 'DELETE') {
        permissions.assertTerm('delete', taxonomy, context)
        // Explicit and opt-in: deleting "Cuisine" must not silently take
        // "Desserts" with it (the store refuses by default).
        const cascade = single(request.query, 'cascade') === 'true'
        const removed = await store.delete(id, { cascade })
        if (!removed) throw termNotFound(taxonomy.name, id)
        return jsonResponse(204, null)
      }
      return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
    }

    if (action !== 'move') throw noRoute()
    if (method !== 'POST') return methodNotAllowed(['POST'])

    permissions.assertTerm('update', taxonomy, context)
    const body = asRecord(request.body)
    const parent = optionalParent(body)
    if (parent === undefined) {
      throw invalidBody(
        'A move needs a new parent.',
        'Send { "parent": "<term id>" }, or { "parent": null } to move it to the root.',
      )
    }
    return jsonResponse(200, { data: serialise(await store.move(id, parent)) })
  }
}

function termNotFound(taxonomy: string, id: string): CogentaError {
  return new CogentaError({
    code: 'TAXONOMY_TERM_NOT_FOUND',
    message: `No term "${id}" in the "${taxonomy}" taxonomy.`,
    hint: 'Check the identifier — a term of another taxonomy lives in another table.',
    details: { taxonomy, id },
  })
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
    hint: 'Taxonomy routes are /{taxonomy}, /{taxonomy}/{id} and /{taxonomy}/{id}/move.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null

  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}
