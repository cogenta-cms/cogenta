import type { ApiKeyUsage, AuthStore } from '@cogenta/auth'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/api-keys` — L13 task 8, machine-to-machine bearer credentials; expiry
 * defaults, rotation, quota and usage added by fiche 20.
 *
 * Admin-only, no self-service: a key is a grant one person makes for a
 * script or integration, not something the script itself ever manages. The
 * raw key is returned exactly once, in the response to `POST` and to
 * `POST .../rotate`, and never again — every other route, `publicKey`
 * included, has no path that can produce a `key` field. This is the one
 * property in the whole fiche that must never regress: read `publicKey`
 * below before adding a field, and never widen its input type to something
 * that could carry `key`.
 */

export interface ApiKeysRouterOptions {
  readonly auth: AuthStore
  /** Mount point. `/api/api-keys` by default. */
  readonly basePath?: string
  /** Injected so the 90-day default expiry is deterministic in tests. */
  readonly now?: () => number
}

export interface ApiKeysRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/api-keys'

/**
 * "Par défaut : 90 jours" (fiche 20 task 1) — a breaking change from the
 * previous default of "never", called out in this package's changeset. A
 * key that never expires is still available: pass `neverExpires: true`.
 */
const DEFAULT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000

/** The three presets the admin offers for a rotation's grace window, plus the ceiling any value is clamped to. */
const MAX_GRACE_HOURS = 24 * 7
const DEFAULT_GRACE_HOURS = 24

function requireAdmin(actor: Actor, what: string): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: `Only the admin role may ${what}.`,
    hint: 'Ask someone with the admin role to do this for you.',
  })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The request body must be a JSON object.',
      hint: 'Send a JSON object with the fields this route expects.',
    })
  }
  return body as Record<string, unknown>
}

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" is required and must be a non-empty string.`,
      hint: `Send "${field}" in the request body.`,
    })
  }
  return value.trim()
}

function scopeField(body: Record<string, unknown>): readonly string[] {
  const value = body['scope']
  if (!Array.isArray(value) || value.length === 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"scope" must be a non-empty array of role names.',
      hint: "A key with no role can authenticate and do nothing at all — grant at least one role, the same names a collection's permissions use.",
    })
  }
  const scope = value.map((role) => (typeof role === 'string' ? role.trim() : ''))
  if (scope.some((role) => role.length === 0)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'Every entry in "scope" must be a non-empty role name.',
      hint: 'Role names are an open set (contract A) but they are still names.',
    })
  }
  return scope
}

function explicitExpiresAtField(body: Record<string, unknown>): string | undefined {
  const value = body['expiresAt']
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"expiresAt" must be an ISO 8601 timestamp, or omitted to use the default.',
      hint: 'Send an ISO date string, e.g. "2027-01-01T00:00:00.000Z", or set "neverExpires" instead.',
    })
  }
  return value
}

function neverExpiresField(body: Record<string, unknown>): boolean {
  const value = body['neverExpires']
  if (value === undefined) return false
  if (typeof value !== 'boolean') {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"neverExpires" must be a boolean.',
      hint: 'Send true to mint a key with no expiry, or omit it to use the default.',
    })
  }
  return value
}

/**
 * `expiresAt` chosen explicitly wins; failing that, `neverExpires: true`
 * means exactly what it says; failing that, the 90-day default applies.
 * Sending both a concrete date and `neverExpires: true` is a contradiction
 * the caller must resolve, not a silent pick between them.
 */
function resolveExpiry(body: Record<string, unknown>, now: () => number): string | undefined {
  const explicit = explicitExpiresAtField(body)
  const never = neverExpiresField(body)

  if (explicit !== undefined && never) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"expiresAt" and "neverExpires" cannot both be set.',
      hint: 'Choose one: a concrete expiry date, or no expiry at all.',
    })
  }
  if (explicit !== undefined) return explicit
  if (never) return undefined
  return new Date(now() + DEFAULT_EXPIRY_MS).toISOString()
}

function rateLimitPerMinuteField(body: Record<string, unknown>): number | undefined {
  const value = body['rateLimitPerMinute']
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"rateLimitPerMinute" must be a positive integer, or omitted for the default quota.',
      hint: 'Requests per minute this key may make — a generous but real number, not "unlimited".',
    })
  }
  return value
}

function graceHoursField(body: Record<string, unknown>): number {
  const value = body['graceHours']
  if (value === undefined) return DEFAULT_GRACE_HOURS
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"graceHours" must be a positive integer, or omitted for the default.',
      hint: `Send a whole number of hours, up to ${MAX_GRACE_HOURS} (7 days).`,
    })
  }
  if (value > MAX_GRACE_HOURS) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"graceHours" cannot exceed ${MAX_GRACE_HOURS} (7 days).`,
      hint: 'A rotation grace window is meant to be short — a bounded, visible overlap, not a second permanent key.',
    })
  }
  return value
}

function publicKey(key: {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly scope: readonly string[]
  readonly createdBy: string | null
  readonly createdAt: string
  readonly expiresAt: string | undefined
  readonly revokedAt: string | undefined
  readonly lastUsedAt: string | undefined
  readonly rateLimitPerMinute: number
  readonly supersededBy: string | undefined
}): Record<string, unknown> {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scope: key.scope,
    createdBy: key.createdBy,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt ?? null,
    revokedAt: key.revokedAt ?? null,
    lastUsedAt: key.lastUsedAt ?? null,
    rateLimitPerMinute: key.rateLimitPerMinute,
    supersededBy: key.supersededBy ?? null,
  }
}

function publicUsage(usage: ApiKeyUsage): Record<string, unknown> {
  return { last7Days: usage.last7Days, last30Days: usage.last30Days }
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
    hint: 'API key routes are /api/api-keys, /api/api-keys/{id}, /api/api-keys/{id}/rotate, /api/api-keys/{id}/purge and /api/api-keys/{id}/recover.',
  })
}

function keyNotFound(): CogentaError {
  return new CogentaError({
    code: 'API_KEY_NOT_FOUND',
    message: 'No API key with that id.',
    hint: 'It may already have been revoked and removed from the list, or the id may be mistyped.',
  })
}

/**
 * Fiche 67 task 5 — `?limit=` is opt-in, same reasoning as `parseQueueLimit`
 * in `scheduled-tasks-router.ts`: absent means "every key" (`mcp.tsx`'s
 * picker relies on exactly that, byte for byte), present means the
 * "Clés API" screen's own paginated fetch.
 */
const MAX_API_KEYS_LIST_LIMIT = 200

function parseApiKeysLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_API_KEYS_LIST_LIMIT) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"limit" must be a whole number between 1 and ${MAX_API_KEYS_LIST_LIMIT}.`,
      hint: `Ask for between 1 and ${MAX_API_KEYS_LIST_LIMIT} keys.`,
    })
  }
  return parsed
}

function parseApiKeysOffset(value: string | undefined): number {
  if (value === undefined) return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"offset" must be a non-negative whole number.',
      hint: 'Pass the number of keys already loaded.',
    })
  }
  return parsed
}

export function createApiKeysRouter(options: ApiKeysRouterOptions): ApiKeysRouter {
  const { auth } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const now = options.now ?? Date.now

  return {
    handle: async (request, actor) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()

        if (segments.length === 0) return await collectionRoute(request, actor, method)
        if (segments.length === 1) {
          return await keyRoute(actor, segments[0] as string, method)
        }
        if (segments.length === 2 && segments[1] === 'rotate') {
          return await rotateRoute(request, actor, segments[0] as string, method)
        }
        if (segments.length === 2 && segments[1] === 'purge') {
          return await purgeRoute(actor, segments[0] as string, method)
        }
        if (segments.length === 2 && segments[1] === 'recover') {
          return await recoverRoute(actor, segments[0] as string, method)
        }
        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function collectionRoute(
    request: RestRequest,
    actor: Actor,
    method: string,
  ): Promise<RestResponse> {
    if (method === 'GET') {
      requireAdmin(actor, 'list API keys')
      const limit = parseApiKeysLimit(single(request.query, 'limit'))
      const offset = parseApiKeysOffset(single(request.query, 'offset'))

      // One extra row past `limit` tells us whether a further page exists,
      // the same trick `audit-router.ts`'s cursor pagination uses — sliced
      // back off before the keys are ever handed out.
      const fetched = await auth.apiKeys.list(
        limit === undefined ? {} : { limit: limit + 1, offset },
      )
      const hasMore = limit !== undefined && fetched.length > limit
      const keys = hasMore ? fetched.slice(0, limit) : fetched

      const data = await Promise.all(
        keys.map(async (key) => ({
          ...publicKey(key),
          usage: publicUsage(await auth.apiKeys.usage(key.id)),
        })),
      )
      return jsonResponse(200, { data, page: { hasMore } })
    }

    if (method === 'POST') {
      requireAdmin(actor, 'create an API key')
      const body = asRecord(request.body)
      const name = stringField(body, 'name')
      const scope = scopeField(body)
      const expiresAt = resolveExpiry(body, now)
      const rateLimitPerMinute = rateLimitPerMinuteField(body)

      const issued = await auth.apiKeys.create({
        name,
        scope,
        createdBy: actor.id,
        ...(expiresAt === undefined ? {} : { expiresAt }),
        ...(rateLimitPerMinute === undefined ? {} : { rateLimitPerMinute }),
      })

      // The only response, ever, that carries the raw key. `key` is absent
      // from every other shape this router returns.
      return jsonResponse(201, { data: { ...publicKey(issued), key: issued.key } })
    }

    return methodNotAllowed(['GET', 'POST'])
  }

  async function keyRoute(actor: Actor, id: string, method: string): Promise<RestResponse> {
    if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
    requireAdmin(actor, 'revoke an API key')

    const existing = await auth.apiKeys.getById(id)
    if (existing === null) throw keyNotFound()

    await auth.apiKeys.revoke(id)
    return { status: 204, body: null, headers: {} }
  }

  /**
   * "Faire tourner cette clé" (fiche 20 task 2). The response carries the new
   * key's raw value once, exactly like `POST /api/api-keys` does, alongside
   * the previous key's public record now that it is on a grace window — the
   * admin screen needs both to show "en sursis jusqu'à …" without a second
   * round trip.
   */
  async function rotateRoute(
    request: RestRequest,
    actor: Actor,
    id: string,
    method: string,
  ): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])
    requireAdmin(actor, 'rotate an API key')

    const body = asRecord(request.body ?? {})
    const graceHours = graceHoursField(body)

    const { issued, previous } = await auth.apiKeys.rotate(id, {
      graceMs: graceHours * 60 * 60 * 1000,
    })

    return jsonResponse(201, {
      data: {
        issued: { ...publicKey(issued), key: issued.key },
        previous: publicKey(previous),
      },
    })
  }

  /**
   * Fiche 62 task 2: a real `DELETE`, admin-only like every other route
   * here. `auth.apiKeys.purge` is the only authority on whether this key is
   * actually eligible (revoked, and revoked long enough ago) — this route
   * adds nothing beyond the permission check and the 404 for an id that was
   * never a key at all.
   */
  async function purgeRoute(actor: Actor, id: string, method: string): Promise<RestResponse> {
    if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
    requireAdmin(actor, 'purge an API key')

    const existing = await auth.apiKeys.getById(id)
    if (existing === null) throw keyNotFound()

    await auth.apiKeys.purge(id)
    return { status: 204, body: null, headers: {} }
  }

  /**
   * Fiche 62 task 3, decision (b): recovers from a key revoked by mistake by
   * minting a replacement, exactly like `rotateRoute` above — same response
   * shape, same one-time raw key — except the revoked key it replaces never
   * has its `revoked_at` lifted. `auth.apiKeys.recover` is what actually
   * enforces the recovery window; this route only adds the permission check.
   */
  async function recoverRoute(actor: Actor, id: string, method: string): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])
    requireAdmin(actor, 'recover a revoked API key')

    const issued = await auth.apiKeys.recover(id)
    return jsonResponse(201, { data: { ...publicKey(issued), key: issued.key } })
  }
}
