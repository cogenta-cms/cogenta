import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CogentaError, isCogentaError } from '@cogenta/core'
import type { SearchConsoleConnectionStore } from '@cogenta/schema'
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchSearchAnalytics,
  refreshAccessToken,
  type SearchConsoleFetch,
  type SearchConsoleMetricsRow,
  type SearchConsoleOAuthOptions,
} from '@cogenta/seo'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/seo/search-console` — fiche 70 task 4, ADR-0032: an optional,
 * off-by-default connector to Google Search Console's real performance
 * data (clicks, impressions, position). A separate file from `seo-router.ts`
 * on purpose — an OAuth redirect flow has a shape nothing else in that
 * router shares (a route Google's own browser redirect reaches with no
 * `Authorization` header at all, a `state` parameter that stands in for
 * session-based CSRF protection, a `302` response instead of JSON) and
 * mixing it into the read-mostly diagnostics router would obscure both.
 *
 *   GET  /api/seo/search-console/status       admin-only: is the connector offered, is a site connected
 *   GET  /api/seo/search-console/authorize    admin-only: { url } to send the browser to
 *   GET  /api/seo/search-console/callback     Google's own redirect target — no bearer token, `state` is the proof
 *   GET  /api/seo/search-console/metrics      admin-only: clicks/impressions/CTR/position per page, last N days
 *   POST /api/seo/search-console/disconnect   admin-only
 *
 * **Why `callback` needs no `Authorization` header, and why that is still
 * safe.** Google redirects the admin's own browser here after consent — a
 * plain navigation, which cannot carry a bearer token the way the admin
 * SPA's own `fetch` calls do. The actual authorization decision already
 * happened at `authorize`, which *is* bearer-gated (`admin` only); `state`
 * is an HMAC over a random nonce and an issue time, keyed by
 * `COGENTA_AUTH_SIGNING_KEY` (the same secret this codebase already trusts
 * for session tokens) with a ten-minute freshness window — nobody without
 * that key can mint one, so a `callback` request carrying a valid `state`
 * can only be continuing a flow this server itself started for an admin who
 * had already passed the bearer check. This is the same shape a signed,
 * short-lived cookie would give, without needing session storage this
 * codebase does not otherwise have (rule R1).
 */

export interface SearchConsoleRouterOptions {
  readonly store: SearchConsoleConnectionStore
  /** `COGENTA_AUTH_SIGNING_KEY` — used only to mint/verify the OAuth `state`, never persisted by this router itself. */
  readonly signingKey: string
  /** Absent means no `COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`_CLIENT_SECRET` is set — every route beyond `status` answers `SEARCH_CONSOLE_NOT_CONFIGURED` (R1/R2: the rest of the SEO screen is unaffected). */
  readonly oauth?: SearchConsoleOAuthOptions
  /** The GSC property this connection queries — this site's own base URL. A domain property (`sc-domain:…`) is out of scope for the first version; see `BLOCKERS.md`. */
  readonly siteUrl: string
  /** Overridable in tests; defaults to the global `fetch`. */
  readonly fetchImpl?: SearchConsoleFetch
  /** Mount point. `/api/seo/search-console` by default. */
  readonly basePath?: string
  /** Where the callback redirects the browser back to once it is done — the admin's own SEO screen. */
  readonly adminReturnPath?: string
}

export interface SearchConsoleRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/seo/search-console'
const DEFAULT_ADMIN_RETURN_PATH = '/admin/seo?tab=diagnostics'
/** How many days of history one metrics call asks Google for. */
const DEFAULT_WINDOW_DAYS = 28
/** How long a minted `state` stays valid — long enough for a real consent screen, short enough that a stale/leaked callback URL is refused. */
const STATE_FRESHNESS_MS = 10 * 60 * 1000

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
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
    hint:
      'The Search Console routes are GET status/authorize/callback/metrics and ' +
      'POST disconnect, all under /api/seo/search-console.',
  })
}

function forbiddenAdmin(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: the Search Console connector can only be managed by the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext): void {
  if (context.actor.roles.includes('admin')) return
  throw forbiddenAdmin(context)
}

function notConfigured(): CogentaError {
  return new CogentaError({
    code: 'SEARCH_CONSOLE_NOT_CONFIGURED',
    message: 'No Google OAuth app is configured for this installation.',
    hint: 'Set COGENTA_SEARCH_CONSOLE_CLIENT_ID and COGENTA_SEARCH_CONSOLE_CLIENT_SECRET to offer this connector.',
  })
}

function mintState(signingKey: string): string {
  const nonce = randomBytes(16).toString('base64url')
  const issuedAt = Date.now().toString()
  const mac = createHmac('sha256', signingKey).update(`${nonce}.${issuedAt}`).digest('base64url')
  return `${nonce}.${issuedAt}.${mac}`
}

function verifyState(signingKey: string, state: string): boolean {
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const [nonce, issuedAtRaw, mac] = parts as [string, string, string]
  const expectedMac = createHmac('sha256', signingKey)
    .update(`${nonce}.${issuedAtRaw}`)
    .digest('base64url')

  const given = Buffer.from(mac, 'utf8')
  const expected = Buffer.from(expectedMac, 'utf8')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false

  const issuedAt = Number(issuedAtRaw)
  if (!Number.isFinite(issuedAt)) return false
  return Date.now() - issuedAt <= STATE_FRESHNESS_MS
}

function singleQueryValue(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function createSearchConsoleRouter(
  options: SearchConsoleRouterOptions,
): SearchConsoleRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const statusPath = `${basePath}/status`
  const authorizePath = `${basePath}/authorize`
  const callbackPath = `${basePath}/callback`
  const metricsPath = `${basePath}/metrics`
  const disconnectPath = `${basePath}/disconnect`
  const adminReturnPath = options.adminReturnPath ?? DEFAULT_ADMIN_RETURN_PATH
  const fetchImpl = options.fetchImpl

  async function status(context: AccessContext): Promise<RestResponse> {
    assertAdmin(context)
    const configured = options.oauth !== undefined
    const connection = configured ? await options.store.read() : null
    return jsonResponse(200, {
      data: {
        configured,
        connected: connection !== null,
        ...(connection === null
          ? {}
          : {
              siteUrl: connection.siteUrl,
              connectedAt: connection.connectedAt,
              updatedAt: connection.updatedAt,
            }),
      },
    })
  }

  async function authorize(context: AccessContext): Promise<RestResponse> {
    assertAdmin(context)
    if (options.oauth === undefined) throw notConfigured()
    const state = mintState(options.signingKey)
    return jsonResponse(200, { data: { url: buildAuthorizationUrl(options.oauth, state) } })
  }

  /**
   * No `assertAdmin` here — see this file's own module comment for why a
   * valid `state` is the proof of authorization on this route, not a bearer
   * token the browser cannot present.
   */
  async function callback(request: RestRequest): Promise<RestResponse> {
    if (options.oauth === undefined) throw notConfigured()

    const errorParam = singleQueryValue(request.query.error)
    if (errorParam !== undefined) {
      return redirectToAdmin('denied')
    }

    const state = singleQueryValue(request.query.state)
    const code = singleQueryValue(request.query.code)
    if (state === undefined || !verifyState(options.signingKey, state)) {
      throw new CogentaError({
        code: 'SEARCH_CONSOLE_STATE_INVALID',
        message: 'The OAuth callback state is missing, malformed or expired.',
        hint: 'Start the connection again from the SEO screen — a callback link is only valid for ten minutes.',
      })
    }
    if (code === undefined) {
      return redirectToAdmin('denied')
    }

    const tokens = await exchangeAuthorizationCode(options.oauth, code, fetchImpl)
    await options.store.connect({ siteUrl: options.siteUrl, refreshToken: tokens.refreshToken })
    return redirectToAdmin('connected')
  }

  function redirectToAdmin(outcome: 'connected' | 'denied'): RestResponse {
    const separator = adminReturnPath.includes('?') ? '&' : '?'
    return {
      status: 302,
      body: null,
      headers: { location: `${adminReturnPath}${separator}search_console=${outcome}` },
    }
  }

  async function metrics(context: AccessContext): Promise<RestResponse> {
    assertAdmin(context)
    if (options.oauth === undefined) throw notConfigured()

    const refreshToken = await options.store.decryptRefreshToken()
    const { accessToken } = await refreshAccessToken(options.oauth, refreshToken, fetchImpl)

    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const rows: readonly SearchConsoleMetricsRow[] = await fetchSearchAnalytics(
      {
        accessToken,
        siteUrl: options.siteUrl,
        startDate: dateOnly(startDate),
        endDate: dateOnly(endDate),
      },
      fetchImpl,
    )

    return jsonResponse(200, {
      data: { siteUrl: options.siteUrl, windowDays: DEFAULT_WINDOW_DAYS, rows },
    })
  }

  async function disconnect(context: AccessContext): Promise<RestResponse> {
    assertAdmin(context)
    await options.store.disconnect()
    return jsonResponse(200, { data: { disconnected: true } })
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        const path = normalise(request.path.split('?')[0] ?? request.path)
        const method = request.method.toUpperCase()

        if (path === statusPath) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          return await status(context)
        }
        if (path === authorizePath) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          return await authorize(context)
        }
        if (path === callbackPath) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          return await callback(request)
        }
        if (path === metricsPath) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          return await metrics(context)
        }
        if (path === disconnectPath) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          return await disconnect(context)
        }
        throw noRoute()
      } catch (error) {
        if (isCogentaError(error) && error.code === 'SEARCH_CONSOLE_STATE_INVALID') {
          // Never leaks *why* the state failed (expired vs. forged vs.
          // missing) into a redirect a browser history could keep — the
          // admin sees a plain "connection failed, try again" outcome.
          return redirectToAdmin('denied')
        }
        return errorResponse(error)
      }
    },
  }
}
