import { CogentaError } from '@cogenta/core'
import type { RedirectReason, RedirectRecord, RedirectStatus, RedirectStore } from '@cogenta/schema'
import { REDIRECT_REASONS } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/redirects` — the admin screen `RedirectStore` never had (L10 audit
 * follow-up).
 *
 * `RedirectStore` (`@cogenta/schema`) has existed since L10 task 2 and is
 * already applied to *every* public GET by `cogenta serve` — it only ever
 * lacked a way for an editor to add or remove a row without touching the
 * database by hand. This router is that missing route, and nothing else:
 * loop and self-redirect refusal is the store's own job (`add` throws
 * `CONTENT_REDIRECT_LOOP`/`CONTENT_ROUTE_INVALID`), not reimplemented here.
 *
 *   GET    /api/redirects            list (?collection=, ?locale=)
 *   POST   /api/redirects            create { from, to, status?, reason? }
 *   DELETE /api/redirects?from=/old  remove the rule leaving `from`
 *
 * Admin-only on every method, including GET: a redirect table is a technical
 * routing decision (an old URL a renamed page still occupies), not content —
 * unlike a menu or a taxonomy, nothing here is ever served to a visitor
 * directly.
 *
 * `DELETE` takes `from` as a query parameter rather than a path segment on
 * purpose: a redirect's `from` is itself a site path, so `/api/redirects/old`
 * could never carry `/old/nested-page` without a second layer of encoding
 * that would only exist for this one route.
 */

export interface RedirectRouterOptions {
  readonly store: RedirectStore
  /** Mount point. `/api/redirects` by default. */
  readonly basePath?: string
}

export interface RedirectRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/redirects'

interface SerialisedRedirect {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: RedirectStatus
  readonly collection: string | null
  readonly entryId: string | null
  readonly locale: string | null
  readonly reason: RedirectReason
  readonly createdAt: number
}

function serialise(record: RedirectRecord): SerialisedRedirect {
  return {
    id: record.id,
    from: record.from,
    to: record.to,
    status: record.status,
    collection: record.collection,
    entryId: record.entryId,
    locale: record.locale,
    reason: record.reason,
    createdAt: record.createdAt,
  }
}

function invalidBody(what: string, hint: string): CogentaError {
  return new CogentaError({ code: 'CONTENT_ROUTE_INVALID', message: what, hint })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function requiredPath(body: Record<string, unknown>, field: 'from' | 'to'): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidBody(
      `A redirect needs a "${field}".`,
      'Send { "from": "/old-page", "to": "/new-page" }.',
    )
  }
  return value
}

function optionalStatus(body: Record<string, unknown>): RedirectStatus | undefined {
  if (!Object.hasOwn(body, 'status')) return undefined
  const status = body.status
  if (status !== 301 && status !== 302) {
    throw invalidBody(
      '"status" must be 301 or 302.',
      'Send 301 for a permanent redirect, 302 for a temporary one.',
    )
  }
  return status
}

function optionalReason(body: Record<string, unknown>): RedirectReason | undefined {
  if (!Object.hasOwn(body, 'reason')) return undefined
  const reason = body.reason
  if (typeof reason !== 'string' || !(REDIRECT_REASONS as readonly string[]).includes(reason)) {
    throw invalidBody(
      `"reason" must be one of: ${REDIRECT_REASONS.join(', ')}.`,
      'Drop "reason" to default to "manual".',
    )
  }
  return reason as RedirectReason
}

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: redirects can only be managed by the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context)
}

function redirectNotFound(from: string): CogentaError {
  return new CogentaError({
    code: 'REDIRECT_UNKNOWN',
    message: `No redirect leaves "${from}".`,
    hint: 'Check the path — it may already have been removed, or never existed.',
    details: { from },
  })
}

export function createRedirectRouter(options: RedirectRouterOptions): RedirectRouter {
  const { store } = options
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
    if (normalise(request.path.split('?')[0] ?? request.path) !== basePath) throw noRoute()
    const method = request.method.toUpperCase()

    assertAdmin(context)

    if (method === 'GET') {
      const collection = single(request.query, 'collection')
      const locale = single(request.query, 'locale')
      const records = await store.list({
        ...(collection === undefined ? {} : { collection }),
        ...(locale === undefined ? {} : { locale }),
      })
      return jsonResponse(200, { data: records.map(serialise) })
    }

    if (method === 'POST') {
      const body = asRecord(request.body)
      const status = optionalStatus(body)
      const reason = optionalReason(body)
      const record = await store.add({
        from: requiredPath(body, 'from'),
        to: requiredPath(body, 'to'),
        ...(status === undefined ? {} : { status }),
        ...(reason === undefined ? {} : { reason }),
      })
      return jsonResponse(201, { data: serialise(record) })
    }

    if (method === 'DELETE') {
      const from = single(request.query, 'from')
      if (from === undefined || from.length === 0) {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: 'The "from" query parameter is required.',
          hint: 'Send DELETE /api/redirects?from=/old-page.',
        })
      }
      const removed = await store.remove(from)
      if (!removed) throw redirectNotFound(from)
      return jsonResponse(204, null)
    }

    return methodNotAllowed(['GET', 'POST', 'DELETE'])
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
    hint: 'The redirects route is GET/POST/DELETE /api/redirects.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
