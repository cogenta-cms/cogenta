import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  countTaxonomyUsage,
  type TaxonomyDefinition,
  type TaxonomyStore,
  type TaxonomyTerm,
  type TermUsage,
} from '@cogenta/schema'
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
 * The list route also answers three query parameters (`08-taxonomies.md`,
 * task 3): `?q=` filters by label or slug, accent- and case-insensitive;
 * `?counts=1` adds how many entries carry each term, direct and with
 * descendants; `?unused=1` keeps only the terms nothing classifies directly.
 * Both count-bearing parameters are silently inert unless `usage` was passed
 * to `createTaxonomyRouter` — a site with none wired still lists its terms.
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

/**
 * What `?counts=1`/`?unused=1` need: a database to query and the site's
 * collections, so usage can be found across every one of them that carries a
 * `taxonomy` field pointing here.
 *
 * Optional on the router as a whole (`R2`-shaped: a taxonomy lists and
 * writes its terms with nothing more than `storeFor`), and required only the
 * moment a caller actually asks for counts.
 */
export interface TaxonomyUsageSource {
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
}

export interface TaxonomyRouterOptions {
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly permissions: PermissionLayer
  readonly storeFor: (taxonomy: TaxonomyDefinition) => TaxonomyStore
  /** Wires `?counts=1` and `?unused=1`. Left out, both parameters are ignored. */
  readonly usage?: TaxonomyUsageSource
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
  /** Present only when `?counts=1` was asked for and `usage` is wired. */
  readonly entryCount?: TermUsage
}

/**
 * `path` is deliberately **not** serialised.
 *
 * It is a storage detail of the materialised path, and a client that learned
 * to parse it would be coupled to a decision ADR-0022 took for the database's
 * sake. `parent` and `depth` say everything a tree renderer needs.
 */
function serialise(term: TaxonomyTerm, usage?: ReadonlyMap<string, TermUsage>): SerialisedTerm {
  const entryCount = usage?.get(term.id)
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
    ...(entryCount === undefined ? {} : { entryCount }),
  }
}

/** Strips diacritics and case, so "Cafe" with an accent matches "cafe" without one. */
const COMBINING_MARKS = /[̀-ͯ]/gu

/**
 * Folds a string for search: decompose accented letters into base letter plus
 * combining mark (`́` etc.), then drop every combining mark.
 *
 * Done in JS rather than SQL on purpose — `unaccent` is a Postgres extension
 * that may not be installed, MySQL's accent folding depends on the column
 * collation, and SQLite has neither. The whole term list is already read into
 * memory for tree ordering, so this never costs a second query, and it
 * behaves identically on all three dialects because it never touches one.
 */
function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/** Whether a term's slug or any of its labels contain `query`, accent- and case-insensitively. */
function matchesQuery(term: TaxonomyTerm, foldedQuery: string): boolean {
  if (foldForSearch(term.slug).includes(foldedQuery)) return true
  return Object.values(term.labels).some((label) => foldForSearch(label).includes(foldedQuery))
}

/** `?counts=1` and `?counts=true` both mean yes; absent or anything else means no. */
function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true'
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
  const collectionsByName = new Map(
    (options.usage?.collections ?? []).map((collection) => [collection.name, collection]),
  )

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

  /**
   * Usage counts for `?counts=1`/`?unused=1`, gated the same way every other
   * read of unpublished content is: a collection this actor may not read
   * contributes nothing, and one whose drafts they may not see only counts
   * its published entries (`BLOCKERS.md`: "le compteur peut fuiter").
   */
  async function usageFor(
    taxonomy: TaxonomyDefinition,
    terms: readonly TaxonomyTerm[],
    context: AccessContext,
  ): Promise<ReadonlyMap<string, TermUsage>> {
    const source = options.usage
    if (source === undefined) return new Map()

    return countTaxonomyUsage({
      db: source.db,
      taxonomy,
      terms,
      collections: source.collections,
      readable: (collectionName) => {
        const collection = collectionsByName.get(collectionName)
        return collection !== undefined && permissions.can('read', collection, context).allowed
      },
      includeDrafts: (collectionName) => {
        const collection = collectionsByName.get(collectionName)
        return (
          collection !== undefined && permissions.canReadUnpublished(collection, context).allowed
        )
      },
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
        let terms = under === undefined ? await store.list() : await store.list({ under })

        const query = single(request.query, 'q')
        if (query !== undefined && query.trim() !== '') {
          const folded = foldForSearch(query.trim())
          terms = terms.filter((term) => matchesQuery(term, folded))
        }

        const wantsCounts = isTruthyFlag(single(request.query, 'counts'))
        const wantsUnusedOnly = isTruthyFlag(single(request.query, 'unused'))
        const usage =
          (wantsCounts || wantsUnusedOnly) && options.usage !== undefined
            ? await usageFor(taxonomy, terms, context)
            : undefined

        if (wantsUnusedOnly && usage !== undefined) {
          terms = terms.filter((term) => (usage.get(term.id)?.own ?? 0) === 0)
        }

        return jsonResponse(200, { data: terms.map((term) => serialise(term, usage)) })
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
