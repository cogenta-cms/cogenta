import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createSearchConsoleConnectionStore,
  ensureSearchConsoleConnectionTable,
  type SearchConsoleConnectionStore,
} from '@cogenta/schema'
import type { SearchConsoleFetch } from '@cogenta/seo'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSearchConsoleRouter,
  type SearchConsoleRouter,
} from '../../src/rest/search-console-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `/api/seo/search-console` (fiche 70 task 4, ADR-0032). Real SQLite for the
 * connection store, a scripted `fetch` for every call that would otherwise
 * reach Google — no live Google account is available for this suite.
 */

const SIGNING_KEY = 'router-test-signing-key-not-a-real-secret'
const OAUTH = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.com/api/seo/search-console/callback',
}

function actor(...roles: readonly string[]): AccessContext {
  const value: Actor = { id: roles.length === 0 ? null : 'user-1', roles }
  return { actor: value }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/seo/search-console', () => {
  let directory: string
  let db: DatabaseHandle
  let store: SearchConsoleConnectionStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-search-console-route-'))
    db = await createSqliteHandle({ url: join(directory, 'sc.db') })
    await ensureSearchConsoleConnectionTable(db)
    store = createSearchConsoleConnectionStore({ db, signingKey: SIGNING_KEY })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  function router(
    overrides: {
      readonly oauth?: typeof OAUTH | undefined
      readonly notConfigured?: boolean
      readonly fetchImpl?: SearchConsoleFetch
    } = {},
  ): SearchConsoleRouter {
    const oauth = overrides.notConfigured === true ? undefined : (overrides.oauth ?? OAUTH)
    return createSearchConsoleRouter({
      store,
      signingKey: SIGNING_KEY,
      siteUrl: 'https://example.com/',
      ...(oauth === undefined ? {} : { oauth }),
      ...(overrides.fetchImpl === undefined ? {} : { fetchImpl: overrides.fetchImpl }),
    })
  }

  const ask = (
    r: SearchConsoleRouter,
    method: string,
    path: string,
    context: AccessContext = { actor: ANONYMOUS },
  ) => r.handle({ method, path, query: {} }, context)

  describe('GET status', () => {
    it('is admin-only', async () => {
      const r = router()
      expect((await ask(r, 'GET', '/api/seo/search-console/status')).status).toBe(403)
      expect((await ask(r, 'GET', '/api/seo/search-console/status', actor('editor'))).status).toBe(
        403,
      )
      expect((await ask(r, 'GET', '/api/seo/search-console/status', actor('admin'))).status).toBe(
        200,
      )
    })

    it('reports not configured when no OAuth app is set, without ever touching the store', async () => {
      const r = router({ notConfigured: true })
      const response = await ask(r, 'GET', '/api/seo/search-console/status', actor('admin'))
      const data = (response.body as { data: { configured: boolean; connected: boolean } }).data
      expect(data.configured).toBe(false)
      expect(data.connected).toBe(false)
    })

    it('reports connected once a site has connected, with the site URL and no token', async () => {
      await store.connect({ siteUrl: 'https://example.com/', refreshToken: 'secret-token' })
      const r = router()
      const response = await ask(r, 'GET', '/api/seo/search-console/status', actor('admin'))
      const data = response.body as { data: Record<string, unknown> }
      expect(data.data.connected).toBe(true)
      expect(data.data.siteUrl).toBe('https://example.com/')
      expect(JSON.stringify(data)).not.toContain('secret-token')
    })
  })

  describe('GET authorize', () => {
    it('is admin-only', async () => {
      const r = router()
      expect((await ask(r, 'GET', '/api/seo/search-console/authorize')).status).toBe(403)
    })

    it('answers SEARCH_CONSOLE_NOT_CONFIGURED (501) when no OAuth app is set', async () => {
      const r = router({ notConfigured: true })
      const response = await ask(r, 'GET', '/api/seo/search-console/authorize', actor('admin'))
      expect(response.status).toBe(501)
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'SEARCH_CONSOLE_NOT_CONFIGURED',
      )
    })

    it('returns a real Google authorization URL naming a fresh state', async () => {
      const r = router()
      const response = await ask(r, 'GET', '/api/seo/search-console/authorize', actor('admin'))
      const url = new URL((response.body as { data: { url: string } }).data.url)
      expect(url.hostname).toBe('accounts.google.com')
      expect(url.searchParams.get('state')).toBeTruthy()
      expect(url.searchParams.get('scope')).toContain('readonly')
    })
  })

  describe('GET callback', () => {
    async function mintedState(r: SearchConsoleRouter, admin: AccessContext): Promise<string> {
      const response = await ask(r, 'GET', '/api/seo/search-console/authorize', admin)
      const url = new URL((response.body as { data: { url: string } }).data.url)
      return url.searchParams.get('state') as string
    }

    it("needs no bearer token at all — Google's own redirect carries none", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
      ) as unknown as SearchConsoleFetch
      const r = router({ fetchImpl })
      const state = await mintedState(r, actor('admin'))

      const response = await r.handle(
        {
          method: 'GET',
          path: '/api/seo/search-console/callback',
          query: { code: 'auth-code', state },
        },
        { actor: ANONYMOUS },
      )

      expect(response.status).toBe(302)
    })

    it('completes the connection and redirects to the admin screen with a success marker', async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ access_token: 'a', refresh_token: 'the-refresh-token', expires_in: 3600 }),
      ) as unknown as SearchConsoleFetch
      const r = router({ fetchImpl })
      const state = await mintedState(r, actor('admin'))

      const response = await r.handle(
        {
          method: 'GET',
          path: '/api/seo/search-console/callback',
          query: { code: 'auth-code', state },
        },
        { actor: ANONYMOUS },
      )

      expect(response.status).toBe(302)
      expect(response.headers['location']).toContain('search_console=connected')
      expect(await store.decryptRefreshToken()).toBe('the-refresh-token')
    })

    it('redirects with a denied marker when Google reports the user declined', async () => {
      const r = router()
      const response = await r.handle(
        {
          method: 'GET',
          path: '/api/seo/search-console/callback',
          query: { error: 'access_denied' },
        },
        { actor: ANONYMOUS },
      )
      expect(response.status).toBe(302)
      expect(response.headers['location']).toContain('search_console=denied')
    })

    it('redirects with a denied marker rather than connecting when state is missing or forged', async () => {
      const r = router()
      const response = await r.handle(
        {
          method: 'GET',
          path: '/api/seo/search-console/callback',
          query: { code: 'x', state: 'forged.123.notarealmac' },
        },
        { actor: ANONYMOUS },
      )
      expect(response.status).toBe(302)
      expect(response.headers['location']).toContain('search_console=denied')
      expect(await store.read()).toBeNull()
    })

    it('refuses a state minted more than ten minutes ago', async () => {
      const realNow = Date.now
      Date.now = () => realNow() - 11 * 60 * 1000
      const r = router()
      const state = await mintedState(r, actor('admin'))
      Date.now = realNow

      const response = await r.handle(
        { method: 'GET', path: '/api/seo/search-console/callback', query: { code: 'x', state } },
        { actor: ANONYMOUS },
      )
      expect(response.headers['location']).toContain('search_console=denied')
      expect(await store.read()).toBeNull()
    })

    it('refuses a second presentation of an otherwise valid, still-fresh state — security review finding', async () => {
      // One router instance throughout — exactly the real shape: a single
      // `cogenta serve` process handles both the legitimate callback and
      // any later replay of a captured `state` against that same running
      // server.
      let callCount = 0
      const fetchImpl = vi.fn(async () => {
        callCount += 1
        return jsonResponse({
          access_token: 'a',
          refresh_token: callCount === 1 ? 'first-refresh-token' : 'attacker-refresh-token',
          expires_in: 3600,
        })
      }) as unknown as SearchConsoleFetch
      const r = router({ fetchImpl })
      const state = await mintedState(r, actor('admin'))

      const first = await r.handle(
        {
          method: 'GET',
          path: '/api/seo/search-console/callback',
          query: { code: 'first-code', state },
        },
        { actor: ANONYMOUS },
      )
      expect(first.headers['location']).toContain('search_console=connected')
      expect(await store.decryptRefreshToken()).toBe('first-refresh-token')

      // A captured copy of the exact same state — from a shared machine's
      // browser history, or a reverse proxy's access log — replayed by
      // someone with no Cogenta credential at all, inside the same
      // ten-minute window. It must not be able to overwrite the connection
      // a second time.
      const replay = await r.handle(
        {
          method: 'GET',
          path: '/api/seo/search-console/callback',
          query: { code: 'attacker-code', state },
        },
        { actor: ANONYMOUS },
      )
      expect(replay.headers['location']).toContain('search_console=denied')
      expect(await store.decryptRefreshToken()).toBe('first-refresh-token')
      // Google's own token endpoint is never even asked to exchange the
      // replayed code — the replay is refused before any outbound call.
      expect(callCount).toBe(1)
    })
  })

  describe('GET metrics', () => {
    it('is admin-only', async () => {
      const r = router()
      expect((await ask(r, 'GET', '/api/seo/search-console/metrics')).status).toBe(403)
    })

    it('answers SEARCH_CONSOLE_NOT_CONNECTED (404) when nothing has connected yet', async () => {
      const r = router()
      const response = await ask(r, 'GET', '/api/seo/search-console/metrics', actor('admin'))
      expect(response.status).toBe(404)
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'SEARCH_CONSOLE_NOT_CONNECTED',
      )
    })

    it('refreshes the access token and returns real rows once connected', async () => {
      await store.connect({ siteUrl: 'https://example.com/', refreshToken: 'stored-refresh' })
      const fetchImpl = vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600 })
        }
        return jsonResponse({
          rows: [
            { keys: ['https://example.com/'], clicks: 5, impressions: 50, ctr: 0.1, position: 3 },
          ],
        })
      }) as unknown as SearchConsoleFetch

      const r = router({ fetchImpl })
      const response = await ask(r, 'GET', '/api/seo/search-console/metrics', actor('admin'))
      expect(response.status).toBe(200)
      const data = (response.body as { data: { rows: readonly unknown[] } }).data
      expect(data.rows).toHaveLength(1)
    })
  })

  describe('POST disconnect', () => {
    it('is admin-only', async () => {
      const r = router()
      const response = await r.handle(
        { method: 'POST', path: '/api/seo/search-console/disconnect', query: {} },
        { actor: ANONYMOUS },
      )
      expect(response.status).toBe(403)
    })

    it('clears the stored connection', async () => {
      await store.connect({ siteUrl: 'https://example.com/', refreshToken: 'token' })
      const r = router()
      const response = await r.handle(
        { method: 'POST', path: '/api/seo/search-console/disconnect', query: {} },
        actor('admin'),
      )
      expect(response.status).toBe(200)
      expect(await store.read()).toBeNull()
    })
  })
})
