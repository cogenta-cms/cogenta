import { CogentaError } from '@cogenta/core'

/**
 * Google Search Console connector (fiche 70 task 4, ADR-0032).
 *
 * **`fetch`-only, no Google SDK (R9).** `googleapis` pulls in an auth
 * library, gRPC-adjacent transport code and a dependency tree far larger
 * than the three HTTP calls this file actually needs: build an
 * authorization URL, exchange a code for tokens once, and POST one
 * `searchAnalytics.query` request. All three are plain, documented REST
 * endpoints.
 *
 * **Read-only, structurally.** This file exports no function that could
 * ever submit a sitemap, verify a property or change anything on the
 * Google side — `fetchSearchAnalytics` is the only call that reaches the
 * Search Console API itself, and it is a `POST` to a `query` endpoint that
 * Google's own API classifies as read (ADR-0032 point 4: IndexNow remains
 * the only write path this codebase has toward a search engine).
 *
 * **No state.** Like the rest of `@cogenta/seo`, this module holds no
 * secret and touches no database (rule R5) — `createSearchConsoleConnectionStore`
 * (`@cogenta/schema`) is where a refreshed token is kept; this file only
 * ever receives one as a plain argument and returns a plain result.
 */

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SEARCH_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

/** A fetch-shaped function — overridable in tests, defaults to the global `fetch`. */
export type SearchConsoleFetch = typeof fetch

export interface SearchConsoleOAuthOptions {
  readonly clientId: string
  readonly clientSecret: string
  /** Must exactly match one of the redirect URIs registered on the Google Cloud OAuth client. */
  readonly redirectUri: string
}

/**
 * Where a site's admin is sent to grant access. `state` is opaque to this
 * file — the caller mints and verifies it (CSRF protection belongs to
 * whoever owns the session, not to a URL builder) — and `access_type=offline`
 * plus `prompt=consent` are what make Google actually hand back a
 * `refresh_token`; without both, a re-authorization silently omits it.
 */
export function buildAuthorizationUrl(options: SearchConsoleOAuthOptions, state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SEARCH_ANALYTICS_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

export interface SearchConsoleTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: string
}

interface TokenResponseBody {
  readonly access_token?: unknown
  readonly refresh_token?: unknown
  readonly expires_in?: unknown
  readonly error?: unknown
  readonly error_description?: unknown
}

function tokenExchangeFailed(reason: string, cause?: unknown): CogentaError {
  return new CogentaError({
    code: 'SEARCH_CONSOLE_TOKEN_EXCHANGE_FAILED',
    message: `Google's OAuth token endpoint refused the request: ${reason}.`,
    hint: 'Check the OAuth client id/secret and that the redirect URI is registered exactly, then try connecting again.',
    cause,
  })
}

/**
 * Exchanges a one-time authorization code for a token pair. Called exactly
 * once per connection, right after Google redirects back with `code` —
 * never retried automatically, since a code is single-use and a retry
 * would only produce a second, equally useless failure.
 */
export async function exchangeAuthorizationCode(
  options: SearchConsoleOAuthOptions,
  code: string,
  fetchImpl: SearchConsoleFetch = fetch,
): Promise<SearchConsoleTokens> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const body = (await response.json().catch(() => ({}))) as TokenResponseBody
  if (!response.ok) {
    const reason =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`
    throw tokenExchangeFailed(reason)
  }
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
    // Google omits `refresh_token` when a user has already granted this
    // app access before and `prompt=consent` was somehow not honoured —
    // named explicitly here rather than left to read as a generic parse
    // failure, since the fix (revoke access at myaccount.google.com/permissions,
    // then reconnect) is different from every other failure this function raises.
    throw tokenExchangeFailed(
      typeof body.refresh_token !== 'string'
        ? "no refresh token was returned — revoke this app's access in the Google account and reconnect"
        : 'the response carried no access token',
    )
  }

  const expiresInSeconds = typeof body.expires_in === 'number' ? body.expires_in : 3600
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  }
}

/**
 * Trades a stored refresh token for a fresh access token. Called before
 * every metrics request rather than caching an access token's own expiry
 * (ADR-0032: rapatriés à la demande, not a background poll) — the extra
 * round trip is one request per admin click, not a recurring cost.
 */
export async function refreshAccessToken(
  options: SearchConsoleOAuthOptions,
  refreshToken: string,
  fetchImpl: SearchConsoleFetch = fetch,
): Promise<{ readonly accessToken: string; readonly expiresAt: string }> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const body = (await response.json().catch(() => ({}))) as TokenResponseBody
  if (!response.ok || typeof body.access_token !== 'string') {
    const reason =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`
    throw tokenExchangeFailed(reason)
  }

  const expiresInSeconds = typeof body.expires_in === 'number' ? body.expires_in : 3600
  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  }
}

export interface SearchConsoleMetricsRow {
  readonly page: string
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly position: number
}

export interface SearchAnalyticsQueryOptions {
  readonly accessToken: string
  /** The GSC property as registered — a URL-prefix property (`https://example.com/`) or a domain property (`sc-domain:example.com`). */
  readonly siteUrl: string
  /** `YYYY-MM-DD`. */
  readonly startDate: string
  readonly endDate: string
  /** Defaults to 25 — enough for a "top pages" table without an unbounded response. */
  readonly rowLimit?: number
}

interface SearchAnalyticsResponseBody {
  readonly rows?: readonly {
    readonly keys?: readonly unknown[]
    readonly clicks?: unknown
    readonly impressions?: unknown
    readonly ctr?: unknown
    readonly position?: unknown
  }[]
  readonly error?: { readonly message?: unknown }
}

/**
 * Clicks/impressions/CTR/average position per page over one date range —
 * the one read this whole connector exists for. A `POST` to Google's own
 * `searchAnalytics.query`, which Google itself documents as a read
 * operation despite the HTTP verb (there is no `GET` equivalent in this
 * API): no site data is created or changed by calling it, matching
 * ADR-0032's "jamais de soumission... pour limiter la surface de ce que
 * le jeton autorise".
 */
export async function fetchSearchAnalytics(
  options: SearchAnalyticsQueryOptions,
  fetchImpl: SearchConsoleFetch = fetch,
): Promise<readonly SearchConsoleMetricsRow[]> {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(options.siteUrl)}/searchAnalytics/query`
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: ['page'],
      rowLimit: options.rowLimit ?? 25,
    }),
  })

  const body = (await response.json().catch(() => ({}))) as SearchAnalyticsResponseBody
  if (!response.ok) {
    throw new CogentaError({
      code: 'SEARCH_CONSOLE_QUERY_FAILED',
      message: `Google Search Console refused the query: ${
        typeof body.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`
      }.`,
      hint: 'Confirm the connected Google account is a verified owner of this property in Search Console, then retry.',
    })
  }

  return (body.rows ?? []).map((row) => ({
    page: typeof row.keys?.[0] === 'string' ? row.keys[0] : '',
    clicks: typeof row.clicks === 'number' ? row.clicks : 0,
    impressions: typeof row.impressions === 'number' ? row.impressions : 0,
    ctr: typeof row.ctr === 'number' ? row.ctr : 0,
    position: typeof row.position === 'number' ? row.position : 0,
  }))
}
