import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * `cogenta serve` wiring for the Search Console connector (fiche 70 task 4,
 * ADR-0032) — end to end against a real running server and a real SQLite
 * database. The OAuth exchange and query logic themselves already have
 * their own thorough suites (`@cogenta/seo`'s `search-console.test.ts`,
 * `@cogenta/api`'s `search-console-router.test.ts`); this file exists for
 * what only a real `runServe` can prove: that the route is actually
 * reachable at the right path (not swallowed by the broader `/api/seo`
 * prefix), that it is genuinely absent without the two environment
 * variables (R2), and that it is genuinely present with them, using the
 * real `redirectUri`/`siteUrl` this server derives from its own config.
 */

const PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
}
const COLLECTIONS: readonly CollectionDefinition[] = [PAGE]
const SCHEMA = `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-search-console-serve-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), SCHEMA, 'utf8')
  return root
}

const activeServers: AbortController[] = []

async function startServer(
  root: string,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<{ base: string; stop: () => Promise<void> }> {
  const controller = new AbortController()
  activeServers.push(controller)

  let resolveAddress: (value: { port: number; host: string }) => void
  const address = new Promise<{ port: number; host: string }>((resolve) => {
    resolveAddress = resolve
  })

  const done = runServe({
    cwd: root,
    env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret', ...extraEnv },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
  })
  const bound = await Promise.race([
    address,
    done.then((code) => {
      throw new Error(`runServe exited with code ${code} before it started listening`)
    }),
  ])
  return {
    base: `http://${bound.host}:${bound.port}`,
    stop: async () => {
      controller.abort()
      await done
    },
  }
}

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
  vi.unstubAllGlobals()
})

async function signIn(root: string, base: string, roles: readonly string[]): Promise<string> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')

  const email = `${roles.join('-')}@example.com`
  const password = 'correct horse battery staple'

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const user = await createUserStore(db).create({ email, roles: [...roles] })
  await createCredentialStore(db).setPassword(user.id, password)
  await db.close()

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json()) as { data: { session?: { token: string } } }
  const token = body.data.session?.token
  if (token === undefined) throw new Error('expected a session')
  return token
}

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

describe('cogenta serve — Search Console connector absent by default (fiche 70 task 4, R2)', () => {
  it('reports not configured with no COGENTA_SEARCH_CONSOLE_* set, and every other SEO route still works', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const admin = await signIn(root, server.base, ['admin'])
      const status = await (
        await fetch(`${server.base}/api/seo/search-console/status`, { headers: authed(admin) })
      ).json()
      expect((status as { data: { configured: boolean } }).data.configured).toBe(false)

      // The rest of the SEO screen is genuinely unaffected — this is not a
      // stub that silently 404s the whole /api/seo prefix.
      const diagnostics = await fetch(`${server.base}/api/seo/diagnostics`, {
        headers: authed(admin),
      })
      expect(diagnostics.status).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it('answers SEARCH_CONSOLE_NOT_CONFIGURED for authorize when unconfigured', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const admin = await signIn(root, server.base, ['admin'])
      const response = await fetch(`${server.base}/api/seo/search-console/authorize`, {
        headers: authed(admin),
      })
      expect(response.status).toBe(501)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — Search Console connector, configured (fiche 70 task 4)', () => {
  it('is reachable at its own path, not swallowed by the broader /api/seo prefix', async () => {
    const root = await project()
    const server = await startServer(root, {
      COGENTA_SEARCH_CONSOLE_CLIENT_ID: 'client-id',
      COGENTA_SEARCH_CONSOLE_CLIENT_SECRET: 'client-secret',
    })
    try {
      const admin = await signIn(root, server.base, ['admin'])
      const status = await (
        await fetch(`${server.base}/api/seo/search-console/status`, { headers: authed(admin) })
      ).json()
      expect((status as { data: { configured: boolean } }).data.configured).toBe(true)
    } finally {
      await server.stop()
    }
  })

  it("builds a real authorization URL with a redirect_uri derived from this server's own site.url", async () => {
    const root = await project()
    const server = await startServer(root, {
      COGENTA_SEARCH_CONSOLE_CLIENT_ID: 'client-id',
      COGENTA_SEARCH_CONSOLE_CLIENT_SECRET: 'client-secret',
    })
    try {
      const admin = await signIn(root, server.base, ['admin'])
      const response = await (
        await fetch(`${server.base}/api/seo/search-console/authorize`, { headers: authed(admin) })
      ).json()
      const url = new URL((response as { data: { url: string } }).data.url)
      expect(url.hostname).toBe('accounts.google.com')
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://example.com/api/seo/search-console/callback',
      )
    } finally {
      await server.stop()
    }
  })

  it('completes a full connect/metrics/disconnect cycle against a scripted Google', async () => {
    const root = await project()
    const server = await startServer(root, {
      COGENTA_SEARCH_CONSOLE_CLIENT_ID: 'client-id',
      COGENTA_SEARCH_CONSOLE_CLIENT_SECRET: 'client-secret',
    })
    try {
      const admin = await signIn(root, server.base, ['admin'])

      const authorizeResponse = await (
        await fetch(`${server.base}/api/seo/search-console/authorize`, { headers: authed(admin) })
      ).json()
      const state = new URL(
        (authorizeResponse as { data: { url: string } }).data.url,
      ).searchParams.get('state')
      expect(state).toBeTruthy()

      const realFetch = globalThis.fetch
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const href = String(input)
          if (href.startsWith(server.base)) return realFetch(input, init)
          if (href.includes('oauth2.googleapis.com/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'access-token',
                refresh_token: 'the-refresh-token',
                expires_in: 3600,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (href.includes('searchAnalytics/query')) {
            return new Response(
              JSON.stringify({
                rows: [
                  {
                    keys: ['https://example.com/hello'],
                    clicks: 3,
                    impressions: 40,
                    ctr: 0.075,
                    position: 5.2,
                  },
                ],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          return realFetch(input, init)
        }),
      )

      const callback = await fetch(
        `${server.base}/api/seo/search-console/callback?code=auth-code&state=${state}`,
        { redirect: 'manual' },
      )
      expect(callback.status).toBe(302)
      expect(callback.headers.get('location')).toContain('search_console=connected')

      const status = (await (
        await fetch(`${server.base}/api/seo/search-console/status`, { headers: authed(admin) })
      ).json()) as { data: { connected: boolean; siteUrl?: string } }
      expect(status.data.connected).toBe(true)
      expect(status.data.siteUrl).toBe('https://example.com/')

      const metrics = (await (
        await fetch(`${server.base}/api/seo/search-console/metrics`, { headers: authed(admin) })
      ).json()) as { data: { rows: readonly { page: string; clicks: number }[] } }
      expect(metrics.data.rows).toHaveLength(1)
      expect(metrics.data.rows[0]?.page).toBe('https://example.com/hello')

      const disconnect = await fetch(`${server.base}/api/seo/search-console/disconnect`, {
        method: 'POST',
        headers: authed(admin),
      })
      expect(disconnect.status).toBe(200)

      const afterDisconnect = (await (
        await fetch(`${server.base}/api/seo/search-console/status`, { headers: authed(admin) })
      ).json()) as { data: { connected: boolean } }
      expect(afterDisconnect.data.connected).toBe(false)
    } finally {
      await server.stop()
    }
  }, 30_000)
})
