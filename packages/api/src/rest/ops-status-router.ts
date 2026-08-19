import type { CogentaConfig } from '@cogenta/core'
import { CogentaError } from '@cogenta/core'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET /api/security-status` and `GET /api/webhooks-status` — read-only
 * mirrors of two site settings that only ever lived in `cogenta.config.mjs`
 * (L10 audit follow-up).
 *
 * Both are **read-only by design, not by omission.** `security` (CORS/CSP/HSTS)
 * and `webhooks` (outbound endpoints) come from the site's own configuration
 * file, which is the source of truth precisely because it is versioned in git
 * alongside the code that depends on it (a CSP that allows a script host has
 * to travel with the deploy that added the script). Letting the admin edit
 * them here would mean two sources of truth disagreeing the moment someone
 * edits the file without restarting, or edits the database without touching
 * the file — so this route only ever answers what the process already
 * resolved at startup, the same values `applySecurity`/the webhook emitter
 * already apply to every request.
 *
 * Admin-only: neither answer is public information (an internal CSP or an
 * endpoint URL is exactly the kind of detail a probing attacker wants).
 */

export interface OpsStatusRouterOptions {
  readonly security: CogentaConfig['security']
  readonly webhooks: CogentaConfig['webhooks']
  /**
   * The trash auto-purge, read live rather than mirrored from config (fiche
   * 07 task 5): unlike `security`/`webhooks`, whether the sweep actually ran
   * is process state, not a file on disk. Absent only in a caller that never
   * wires trash purging at all — every real `cogenta serve` passes one.
   */
  readonly trash?: () => TrashStatus
  /** Mount points. `/api/security-status`, `/api/webhooks-status` and `/api/trash-status` by default. */
  readonly securityPath?: string
  readonly webhooksPath?: string
  readonly trashPath?: string
}

export interface OpsStatusRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_SECURITY_PATH = '/api/security-status'
const DEFAULT_WEBHOOKS_PATH = '/api/webhooks-status'
const DEFAULT_TRASH_PATH = '/api/trash-status'

interface SecurityStatus {
  readonly cors: {
    readonly enabled: boolean
    readonly origins: readonly string[]
    readonly methods: readonly string[]
    readonly headers: readonly string[]
    readonly credentials: boolean
    readonly maxAge: number
  }
  readonly csp: string | false | null
  readonly hsts: {
    readonly enabled: boolean
    readonly maxAge: number
    readonly includeSubDomains: boolean
  }
  readonly pageMaxAge: number
}

interface WebhooksStatus {
  readonly endpoints: readonly string[]
  /** `true` when `COGENTA_WEBHOOK_SECRET` is set — never the secret itself (R7). */
  readonly signed: boolean
  /** `true` when endpoints are configured but no secret is set: nothing is sent (see `createContentWebhookEmitter`). */
  readonly disabledForMissingSecret: boolean
}

/**
 * Whether the trash's own promise — "purged automatically" — is actually
 * kept (fiche 07 task 5). `purgeExpired()` has existed on every
 * `ContentStore` since ADR-0022; nothing called it until `cogenta serve`
 * wired a tick for it. `lastRunAt`/`lastPurged` are `null` until the first
 * tick completes, which is honest for the brief window right after startup
 * rather than claiming a sweep that has not happened yet.
 */
export interface TrashStatus {
  /** Days a trashed entry is kept before it is swept, one entry per collection that has a trash at all. */
  readonly retainDaysByCollection: Readonly<Record<string, number>>
  readonly lastRunAt: string | null
  readonly lastPurged: number | null
}

function forbidden(context: AccessContext, what: string): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: `Access denied: ${what} can only be read by the admin role.`,
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext, what: string): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context, what)
}

export function createOpsStatusRouter(options: OpsStatusRouterOptions): OpsStatusRouter {
  const securityPath = normalise(options.securityPath ?? DEFAULT_SECURITY_PATH)
  const webhooksPath = normalise(options.webhooksPath ?? DEFAULT_WEBHOOKS_PATH)
  const trashPath = normalise(options.trashPath ?? DEFAULT_TRASH_PATH)

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  function route(request: RestRequest, context: AccessContext): RestResponse {
    const path = normalise(request.path.split('?')[0] ?? request.path)
    const method = request.method.toUpperCase()

    if (path === securityPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the security configuration')
      const security = options.security
      const status: SecurityStatus = {
        cors: {
          enabled: security.cors.origins.length > 0,
          origins: security.cors.origins,
          methods: security.cors.methods,
          headers: security.cors.headers,
          credentials: security.cors.credentials,
          maxAge: security.cors.maxAge,
        },
        csp: security.csp ?? null,
        hsts: {
          enabled: security.hstsMaxAge > 0,
          maxAge: security.hstsMaxAge,
          includeSubDomains: security.hstsIncludeSubDomains,
        },
        pageMaxAge: security.pageMaxAge,
      }
      return jsonResponse(200, { data: status })
    }

    if (path === webhooksPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the webhook configuration')
      const webhooks = options.webhooks
      const hasSecret = webhooks.secret !== undefined
      const status: WebhooksStatus = {
        endpoints: webhooks.endpoints,
        signed: hasSecret,
        disabledForMissingSecret: webhooks.endpoints.length > 0 && !hasSecret,
      }
      return jsonResponse(200, { data: status })
    }

    if (path === trashPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the trash purge status')
      const status: TrashStatus = options.trash?.() ?? {
        retainDaysByCollection: {},
        lastRunAt: null,
        lastPurged: null,
      }
      return jsonResponse(200, { data: status })
    }

    throw noRoute()
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
    hint: 'The ops status routes are GET /api/security-status, GET /api/webhooks-status and GET /api/trash-status.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
