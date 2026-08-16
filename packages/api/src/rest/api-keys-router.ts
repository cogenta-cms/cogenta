import type { AuthStore } from '@cogenta/auth'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/api-keys` — L13 task 8, machine-to-machine bearer credentials.
 *
 * Admin-only, no self-service: a key is a grant one person makes for a
 * script or integration, not something the script itself ever manages. The
 * raw key is returned exactly once, in the response to `POST`, and never
 * again — the list route only ever shows the prefix stored alongside the
 * hash (`ApiKeyStore.list`).
 */

export interface ApiKeysRouterOptions {
  readonly auth: AuthStore
  /** Mount point. `/api/api-keys` by default. */
  readonly basePath?: string
}

export interface ApiKeysRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/api-keys'

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

function expiresAtField(body: Record<string, unknown>): string | undefined {
  const value = body['expiresAt']
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message:
        '"expiresAt" must be an ISO 8601 timestamp, or omitted for a key that never expires.',
      hint: 'Send an ISO date string, e.g. "2027-01-01T00:00:00.000Z".',
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
  }
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
    hint: 'API key routes are /api/api-keys and /api/api-keys/{id}.',
  })
}

function keyNotFound(): CogentaError {
  return new CogentaError({
    code: 'API_KEY_NOT_FOUND',
    message: 'No API key with that id.',
    hint: 'It may already have been revoked and removed from the list, or the id may be mistyped.',
  })
}

export function createApiKeysRouter(options: ApiKeysRouterOptions): ApiKeysRouter {
  const { auth } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

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
      const keys = await auth.apiKeys.list()
      return jsonResponse(200, { data: keys.map(publicKey) })
    }

    if (method === 'POST') {
      requireAdmin(actor, 'create an API key')
      const body = asRecord(request.body)
      const name = stringField(body, 'name')
      const scope = scopeField(body)
      const expiresAt = expiresAtField(body)

      const issued = await auth.apiKeys.create({
        name,
        scope,
        createdBy: actor.id,
        ...(expiresAt === undefined ? {} : { expiresAt }),
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

    const existing = (await auth.apiKeys.list()).find((key) => key.id === id)
    if (existing === undefined) throw keyNotFound()

    await auth.apiKeys.revoke(id)
    return { status: 204, body: null, headers: {} }
  }
}
