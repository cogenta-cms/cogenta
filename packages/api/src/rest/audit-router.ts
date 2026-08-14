import type { AuditLog } from '@cogenta/auth'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/audit` — the hash-chained log `@cogenta/auth` already keeps
 * (`packages/auth/src/audit.ts`), read-only and restricted to `admin`: it
 * names every actor's writes across the whole site, which is exactly the
 * kind of thing a role below `admin` should not be able to browse.
 */

export interface AuditRouterOptions {
  readonly audit: AuditLog
  /** Mount point. `/api/audit` by default. */
  readonly basePath?: string
}

export interface AuditRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/audit'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may read the audit log.',
    hint: 'Ask someone with the admin role to check this for you.',
  })
}

function parseLimit(query: RestRequest['query']): number | undefined {
  const raw = single(query, 'limit')
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The "limit" query parameter is not a page size.',
      hint: 'Pass a whole number of 1 or more.',
    })
  }
  return parsed
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

export function createAuditRouter(options: AuditRouterOptions): AuditRouter {
  const { audit } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null || segments.length > 1) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'Audit routes are /api/audit and /api/audit/verify.',
          })
        }
        const [action] = segments
        const method = request.method.toUpperCase()

        if (action === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const actorId = single(request.query, 'actorId')
          const filterAction = single(request.query, 'action')
          const collection = single(request.query, 'collection')
          const since = single(request.query, 'since')
          const limit = parseLimit(request.query)
          const entries = await audit.list({
            ...(actorId === undefined ? {} : { actorId }),
            ...(filterAction === undefined ? {} : { action: filterAction }),
            ...(collection === undefined ? {} : { collection }),
            ...(since === undefined ? {} : { since }),
            ...(limit === undefined ? {} : { limit }),
          })
          return jsonResponse(200, { data: entries })
        }

        if (action === 'verify') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          await audit.verify()
          return jsonResponse(200, { data: { ok: true } })
        }

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'Audit routes are /api/audit and /api/audit/verify.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
