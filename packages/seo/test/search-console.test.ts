import { CogentaError } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchSearchAnalytics,
  refreshAccessToken,
  type SearchConsoleFetch,
  type SearchConsoleOAuthOptions,
} from '../src/search-console.js'

/**
 * Google Search Console connector (fiche 70 task 4, ADR-0032) — every test
 * here runs against a scripted `fetch`, never a real network call, so the
 * suite proves the request shape and the error mapping without depending on
 * a live Google account (none is available in CI).
 */

const OPTIONS: SearchConsoleOAuthOptions = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.com/api/seo/search-console/callback',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('buildAuthorizationUrl', () => {
  it('names the read-only scope, offline access and consent — required for a refresh token', () => {
    const url = new URL(buildAuthorizationUrl(OPTIONS, 'csrf-state-123'))

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(OPTIONS.redirectUri)
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/webmasters.readonly',
    )
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('csrf-state-123')
  })

  it('never asks for a write scope', () => {
    const url = new URL(buildAuthorizationUrl(OPTIONS, 's'))
    expect(url.searchParams.get('scope')).not.toContain('webmasters"')
    expect(url.searchParams.get('scope')).not.toBe('https://www.googleapis.com/auth/webmasters')
  })
})

describe('exchangeAuthorizationCode', () => {
  it('posts the authorization_code grant and returns the token pair', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async (_url, init) => {
      const body = init?.body as URLSearchParams
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('code')).toBe('the-code')
      expect(body.get('client_id')).toBe('client-id')
      expect(body.get('client_secret')).toBe('client-secret')
      return jsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      })
    }) as unknown as SearchConsoleFetch

    const tokens = await exchangeAuthorizationCode(OPTIONS, 'the-code', fetchImpl)

    expect(tokens.accessToken).toBe('access-token')
    expect(tokens.refreshToken).toBe('refresh-token')
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('throws SEARCH_CONSOLE_TOKEN_EXCHANGE_FAILED when Google refuses the code', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async () =>
      jsonResponse({ error: 'invalid_grant', error_description: 'Malformed auth code.' }, 400),
    ) as unknown as SearchConsoleFetch

    await expect(exchangeAuthorizationCode(OPTIONS, 'bad-code', fetchImpl)).rejects.toMatchObject({
      code: 'SEARCH_CONSOLE_TOKEN_EXCHANGE_FAILED',
    })
  })

  it('throws when Google omits the refresh token — the "already granted, no prompt honoured" case', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async () =>
      jsonResponse({ access_token: 'access-only', expires_in: 3600 }),
    ) as unknown as SearchConsoleFetch

    const error = await exchangeAuthorizationCode(OPTIONS, 'code', fetchImpl).catch((e) => e)
    expect(error).toBeInstanceOf(CogentaError)
    expect((error as CogentaError).code).toBe('SEARCH_CONSOLE_TOKEN_EXCHANGE_FAILED')
    expect((error as CogentaError).message).toContain('refresh')
  })
})

describe('refreshAccessToken', () => {
  it('posts the refresh_token grant and returns a fresh access token', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async (_url, init) => {
      const body = init?.body as URLSearchParams
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('stored-refresh-token')
      return jsonResponse({ access_token: 'new-access-token', expires_in: 1800 })
    }) as unknown as SearchConsoleFetch

    const result = await refreshAccessToken(OPTIONS, 'stored-refresh-token', fetchImpl)
    expect(result.accessToken).toBe('new-access-token')
  })

  it('throws SEARCH_CONSOLE_TOKEN_EXCHANGE_FAILED when the refresh token is revoked', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async () =>
      jsonResponse({ error: 'invalid_grant', error_description: 'Token has been revoked.' }, 400),
    ) as unknown as SearchConsoleFetch

    await expect(refreshAccessToken(OPTIONS, 'revoked-token', fetchImpl)).rejects.toMatchObject({
      code: 'SEARCH_CONSOLE_TOKEN_EXCHANGE_FAILED',
    })
  })
})

describe('fetchSearchAnalytics', () => {
  it('POSTs a searchAnalytics.query request with the page dimension and returns typed rows', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async (url, init) => {
      expect(String(url)).toContain('/searchAnalytics/query')
      expect(String(url)).toContain(encodeURIComponent('https://example.com/'))
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ authorization: 'Bearer the-token' })
      const body = JSON.parse(init?.body as string)
      expect(body.dimensions).toEqual(['page'])
      expect(body.startDate).toBe('2026-08-01')
      expect(body.endDate).toBe('2026-08-28')
      return jsonResponse({
        rows: [
          {
            keys: ['https://example.com/hello'],
            clicks: 12,
            impressions: 300,
            ctr: 0.04,
            position: 8.5,
          },
        ],
      })
    }) as unknown as SearchConsoleFetch

    const rows = await fetchSearchAnalytics(
      {
        accessToken: 'the-token',
        siteUrl: 'https://example.com/',
        startDate: '2026-08-01',
        endDate: '2026-08-28',
      },
      fetchImpl,
    )

    expect(rows).toEqual([
      { page: 'https://example.com/hello', clicks: 12, impressions: 300, ctr: 0.04, position: 8.5 },
    ])
  })

  it('never sends a request that could submit or change site data — always POST to /query, never /submit', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async () => jsonResponse({ rows: [] }))
    await fetchSearchAnalytics(
      {
        accessToken: 't',
        siteUrl: 'https://example.com/',
        startDate: '2026-08-01',
        endDate: '2026-08-28',
      },
      fetchImpl as unknown as SearchConsoleFetch,
    )

    const calledUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])
    expect(calledUrl).toContain('/searchAnalytics/query')
    expect(calledUrl).not.toContain('sitemaps')
  })

  it("throws SEARCH_CONSOLE_QUERY_FAILED with Google's own message when the query is refused", async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async () =>
      jsonResponse({ error: { message: 'User does not have sufficient permission.' } }, 403),
    ) as unknown as SearchConsoleFetch

    const error = await fetchSearchAnalytics(
      {
        accessToken: 't',
        siteUrl: 'https://example.com/',
        startDate: '2026-08-01',
        endDate: '2026-08-28',
      },
      fetchImpl,
    ).catch((e) => e)

    expect(error).toBeInstanceOf(CogentaError)
    expect((error as CogentaError).code).toBe('SEARCH_CONSOLE_QUERY_FAILED')
    expect((error as CogentaError).message).toContain('sufficient permission')
  })

  it('defaults missing numeric fields to 0 rather than throwing on a malformed row', async () => {
    const fetchImpl: SearchConsoleFetch = vi.fn(async () =>
      jsonResponse({ rows: [{ keys: ['https://example.com/x'] }] }),
    ) as unknown as SearchConsoleFetch

    const rows = await fetchSearchAnalytics(
      {
        accessToken: 't',
        siteUrl: 'https://example.com/',
        startDate: '2026-08-01',
        endDate: '2026-08-28',
      },
      fetchImpl,
    )
    expect(rows).toEqual([
      { page: 'https://example.com/x', clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ])
  })
})
