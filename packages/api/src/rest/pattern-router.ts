import { type BlockRegistry, vocabularyRegistry } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import type {
  Pattern,
  PatternBlock,
  PatternKind,
  PatternProvenanceDetail,
  PatternStore,
  Provenance,
} from '@cogenta/schema'
import { PATTERN_KINDS } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/patterns` — the page builder's motif/model library (fiche 43
 * sub-chantier A; fiche 05 task 1).
 *
 *   GET    /api/patterns          list (?kind=pattern|template)
 *   POST   /api/patterns          save a selection as a pattern or a template
 *   GET    /api/patterns/{id}     one pattern, blocks included
 *   PATCH  /api/patterns/{id}     rename / re-categorise (never the blocks)
 *   DELETE /api/patterns/{id}     remove
 *
 * Admin-only on every method, including every `GET` — the same rule
 * `redirect-router.ts` applies for the same reason: a pattern is a builder
 * fixture, not content a visitor or a lesser role ever reads directly. This
 * is deliberately **not** the collection `update` permission a block
 * insertion itself is gated by: that gate already exists (`PageBuilder`'s
 * `disabled` prop, `POST /api/builder/render`'s `PermissionLayer.assert`),
 * and it is what actually decides whether an editor may drop a pattern's
 * blocks into a page. This router only decides who may curate the shared
 * library those blocks come from.
 *
 * `blocks` is validated the same way a clipboard paste is on the admin side
 * (`isKnownBlockType` in `block-moves.ts`): every block's `type` must be one
 * the site's vocabulary declares. `registry` defaults to the twelve of
 * contract B, exactly like `DependencySource.blocks` in `dependencies.ts` —
 * a site whose theme registers its own blocks (sub-chantier C(ii), a
 * parallel effort) passes its own registry rather than this router growing
 * a second copy of that resolution.
 */
export interface PatternRouterOptions {
  readonly store: PatternStore
  /** Defaults to the twelve of contract B. A site with its own blocks passes its registry. */
  readonly registry?: BlockRegistry
  /** Mount point. `/api/patterns` by default. */
  readonly basePath?: string
}

export interface PatternRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/patterns'

interface SerialisedPattern {
  readonly id: string
  readonly name: string
  readonly category: string | null
  readonly kind: PatternKind
  readonly blocks: readonly PatternBlock[]
  readonly provenance: Provenance
  readonly provenanceDetail: PatternProvenanceDetail | null
  readonly createdAt: string
  readonly updatedAt: string
}

function serialise(pattern: Pattern): SerialisedPattern {
  return {
    id: pattern.id,
    name: pattern.name,
    category: pattern.category,
    kind: pattern.kind,
    blocks: pattern.blocks,
    provenance: pattern.provenance,
    provenanceDetail: pattern.provenanceDetail,
    createdAt: pattern.createdAt,
    updatedAt: pattern.updatedAt,
  }
}

function invalid(message: string, hint: string, details?: Record<string, unknown>): CogentaError {
  return new CogentaError({
    code: 'PATTERN_INVALID',
    message,
    hint,
    ...(details ? { details } : {}),
  })
}

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: patterns can only be managed by admin or editor.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin or editor role.'
        : 'Ask an administrator to grant your account the admin or editor role.',
    details: { roles: context.actor.roles },
  })
}

function assertAccess(context: AccessContext): void {
  const held = new Set(context.actor.roles)
  if (held.has('admin') || held.has('editor')) return
  throw forbidden(context)
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function requiredName(body: Record<string, unknown>): string {
  const name = body.name
  if (typeof name !== 'string' || name.length === 0) {
    throw invalid('A pattern needs a "name".', 'Send { "name": "Hero + 3 features", … }.')
  }
  return name
}

function requiredKind(body: Record<string, unknown>): PatternKind {
  const kind = body.kind
  if (typeof kind !== 'string' || !(PATTERN_KINDS as readonly string[]).includes(kind)) {
    throw invalid(
      `A pattern needs a "kind" of ${PATTERN_KINDS.map((value) => `"${value}"`).join(' or ')}.`,
      'Use "pattern" for a handful of blocks, "template" for a whole page.',
    )
  }
  return kind as PatternKind
}

function optionalCategory(body: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(body, 'category')) return undefined
  const category = body.category
  if (category === null) return null
  if (typeof category === 'string' && category.length > 0) return category
  throw invalid(
    '"category" must be a non-empty string or null.',
    'Drop "category" instead of sending an empty one.',
  )
}

const PROVENANCE_KINDS = ['human', 'assisted', 'generated'] as const

function optionalProvenance(body: Record<string, unknown>): Provenance | undefined {
  if (!Object.hasOwn(body, 'provenance')) return undefined
  const provenance = body.provenance
  if (
    typeof provenance === 'string' &&
    (PROVENANCE_KINDS as readonly string[]).includes(provenance)
  ) {
    return provenance as Provenance
  }
  throw invalid(
    `"provenance" must be one of: ${PROVENANCE_KINDS.join(', ')}.`,
    "Match contract A's own provenance values — a generated pattern must say so.",
  )
}

function optionalProvenanceDetail(
  body: Record<string, unknown>,
): PatternProvenanceDetail | null | undefined {
  if (!Object.hasOwn(body, 'provenanceDetail')) return undefined
  const detail = body.provenanceDetail
  if (detail === null) return null
  if (typeof detail !== 'object' || Array.isArray(detail)) {
    throw invalid(
      '"provenanceDetail" must be an object or null.',
      'Send { "agent": "…", "model": "…", "at": "…" }.',
    )
  }
  return detail as PatternProvenanceDetail
}

/**
 * Validates a pattern's block list the same way the admin's clipboard-paste
 * guard does: every block needs a non-empty `key`/`type`, keys are unique,
 * and `type` must be one this site's vocabulary declares — never inserted
 * "just in case" (fiche 05 task 2's own rule, applied here to the library
 * itself rather than to a single paste).
 */
function requiredBlocks(
  body: Record<string, unknown>,
  registry: BlockRegistry,
): readonly PatternBlock[] {
  const raw = body.blocks
  if (!Array.isArray(raw) || raw.length === 0) {
    throw invalid(
      'A pattern needs a non-empty "blocks" array.',
      'Send the same { key, type, data } shape the builder already sends to /api/builder/render.',
    )
  }

  const seen = new Set<string>()
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw invalid(
        'Every block must be an object.',
        'Send { "key": "…", "type": "…", "data": {} }.',
      )
    }
    const record = entry as Record<string, unknown>
    const key = record.key
    const type = record.type
    if (typeof key !== 'string' || key.length === 0) {
      throw invalid('Every block needs a "key".', 'Send { "key": "…", "type": "…", "data": {} }.')
    }
    if (seen.has(key)) {
      throw invalid(`Two blocks share the key "${key}".`, 'A block key is unique inside a pattern.')
    }
    seen.add(key)
    if (typeof type !== 'string' || type.length === 0) {
      throw invalid('Every block needs a "type".', 'Send { "key": "…", "type": "…", "data": {} }.')
    }
    if (!registry.has(type)) {
      throw invalid(
        `"${type}" is not a block this site's vocabulary declares.`,
        'Only blocks the site can actually render may be saved into a pattern.',
        { type },
      )
    }
    const data = record.data
    if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
      throw invalid(
        `The block "${key}" has a "data" that is not an object.`,
        'Send a plain object.',
      )
    }
    return { key, type, data: (data ?? {}) as Readonly<Record<string, unknown>> }
  })
}

function patternNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'PATTERN_UNKNOWN',
    message: `No pattern "${id}".`,
    hint: 'Check the identifier — list the patterns of this site to find the right one.',
    details: { id },
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
    hint: 'Pattern routes are /api/patterns and /api/patterns/{id}.',
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

export function createPatternRouter(options: PatternRouterOptions): PatternRouter {
  const { store } = options
  const registry = options.registry ?? vocabularyRegistry
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

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
    if (segments === null) throw noRoute()
    const method = request.method.toUpperCase()

    assertAccess(context)

    if (segments.length === 0) {
      if (method === 'GET') {
        const kind = single(request.query, 'kind')
        if (kind !== undefined && !(PATTERN_KINDS as readonly string[]).includes(kind)) {
          throw invalid(
            `"kind" must be one of: ${PATTERN_KINDS.join(', ')}.`,
            'Drop the query parameter to list every kind.',
          )
        }
        const patterns = await store.list(kind === undefined ? {} : { kind: kind as PatternKind })
        return jsonResponse(200, { data: patterns.map(serialise) })
      }
      if (method === 'POST') {
        const body = asRecord(request.body)
        const category = optionalCategory(body)
        const provenance = optionalProvenance(body)
        const provenanceDetail = optionalProvenanceDetail(body)
        const pattern = await store.create({
          name: requiredName(body),
          kind: requiredKind(body),
          blocks: requiredBlocks(body, registry),
          ...(category === undefined ? {} : { category }),
          ...(provenance === undefined ? {} : { provenance }),
          ...(provenanceDetail === undefined ? {} : { provenanceDetail }),
        })
        return jsonResponse(201, { data: serialise(pattern) })
      }
      return methodNotAllowed(['GET', 'POST'])
    }

    if (segments.length !== 1) throw noRoute()
    const id = segments[0]
    if (id === undefined) throw noRoute()

    if (method === 'GET') {
      const pattern = await store.read(id)
      if (pattern === null) throw patternNotFound(id)
      return jsonResponse(200, { data: serialise(pattern) })
    }
    if (method === 'PATCH' || method === 'PUT') {
      const body = asRecord(request.body)
      const category = optionalCategory(body)
      const pattern = await store.update(id, {
        ...(Object.hasOwn(body, 'name') ? { name: requiredName(body) } : {}),
        ...(category === undefined ? {} : { category }),
      })
      return jsonResponse(200, { data: serialise(pattern) })
    }
    if (method === 'DELETE') {
      const removed = await store.delete(id)
      if (!removed) throw patternNotFound(id)
      return jsonResponse(204, null)
    }
    return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
  }
}
