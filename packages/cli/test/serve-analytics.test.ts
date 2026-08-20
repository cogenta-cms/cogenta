import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * End to end: a real `cogenta serve` process, a real page visited over real
 * HTTP, and the resulting page view showing up through the real
 * `/api/analytics/summary` route — the DoD's own requirement ("a visited
 * page triggers an event visible in the summary"), not a unit test standing
 * in for it.
 */

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function project(options: { readonly analyticsRetainDays?: number } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-analytics-'))
  const analyticsSection =
    options.analyticsRetainDays === undefined
      ? ''
      : `,\n  analytics: { retainDays: ${options.analyticsRetainDays} }`
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Analytics test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} }${analyticsSection}
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `import { defineCollection, f } from '@cogenta/schema'

export default [
  defineCollection({
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      blocks: f.blocks({ required: true }),
    },
    indexes: [['slug']],
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  }),
]
`,
    'utf8',
  )

  const { createSqliteHandle } = await import('@cogenta/core')
  const { createContentStore, createSchemaTables, defineCollection, f } = await import(
    '@cogenta/schema'
  )
  const page = defineCollection({
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      blocks: f.blocks({ required: true }),
    },
    indexes: [['slug']],
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  })
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await createSchemaTables(db, [page])
  await createContentStore({ db, collection: page, defaultLocale: 'en' }).create({
    status: 'published',
    createdBy: null,
    values: { title: 'Home', slug: 'home' },
    blocks: { blocks: [{ key: 'hero', type: 'hero', data: { title: 'Hello', eyebrow: 'Demo' } }] },
  })
  await db.close()

  return root
}

async function startServer(
  root: string,
  options: { readonly analyticsPurgeTickMs?: number } = {},
): Promise<{ base: string; stop: () => Promise<void> }> {
  const controller = new AbortController()
  activeServers.push(controller)

  let resolveAddress: (value: { port: number; host: string }) => void
  const address = new Promise<{ port: number; host: string }>((resolve) => {
    resolveAddress = resolve
  })

  const done = runServe({
    cwd: root,
    env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
    ...(options.analyticsPurgeTickMs === undefined
      ? {}
      : { analyticsPurgeTickMs: options.analyticsPurgeTickMs }),
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

async function createAdmin(root: string, base: string): Promise<string> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const users = createUserStore(db)
  const credentials = createCredentialStore(db)
  const user = await users.create({ email: 'admin@example.com', roles: ['admin'] })
  await credentials.setPassword(user.id, 'correct horse battery staple')
  await db.close()

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'correct horse battery staple' }),
  })
  const body = (await response.json()) as { data: { session?: { token: string } } }
  const token = body.data.session?.token
  if (token === undefined) throw new Error('expected a session token')
  return token
}

describe('analytics — end to end through a real server', () => {
  it('a real page view becomes a real event, visible through /api/analytics/summary', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const admin = await createAdmin(root, server.base)

      // Before any visit: nothing recorded.
      const before = await fetch(`${server.base}/api/analytics/summary?days=7`, {
        headers: { authorization: `Bearer ${admin}` },
      })
      expect(before.status).toBe(200)
      const beforeBody = (await before.json()) as { data: { totalViews: number } }
      expect(beforeBody.data.totalViews).toBe(0)

      // A real visitor, over real HTTP, following a real link from an
      // external site — the beacon pixel embedded in the page is what
      // records this, not a direct call to the beacon route.
      const page = await fetch(`${server.base}/home`, {
        headers: { referer: 'https://search.example/results?q=hello' },
      })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('/api/analytics/beacon?p=%2Fhome')

      // The browser loading that <img> pixel — this is what a real browser
      // does automatically; the test does it explicitly to prove the pixel
      // is a real, working route, not just present in the markup.
      const beaconUrlMatch = html.match(/<img src="([^"]*analytics\/beacon[^"]*)"/)
      expect(beaconUrlMatch).not.toBeNull()
      const beaconPath = beaconUrlMatch?.[1]?.replace(/&amp;/g, '&')
      expect(beaconPath).toBeDefined()
      const beaconResponse = await fetch(`${server.base}${beaconPath}`)
      expect(beaconResponse.status).toBe(204)

      const after = await fetch(`${server.base}/api/analytics/summary?days=7`, {
        headers: { authorization: `Bearer ${admin}` },
      })
      const afterBody = (await after.json()) as {
        data: {
          totalViews: number
          uniqueVisitors: number
          topPages: readonly { path: string; views: number; title?: string; editHref?: string }[]
          topReferrers: readonly { domain: string; views: number }[]
        }
      }
      expect(afterBody.data.totalViews).toBe(1)
      expect(afterBody.data.uniqueVisitors).toBe(1)
      // `topPages` is enriched with the real entry's title and admin edit
      // link (fiche 27 task 1) — resolved through the same route matcher and
      // permission-checked gateway the public page render uses, not a mock.
      expect(afterBody.data.topPages).toHaveLength(1)
      expect(afterBody.data.topPages[0]?.path).toBe('/home')
      expect(afterBody.data.topPages[0]?.views).toBe(1)
      expect(afterBody.data.topPages[0]?.title).toBe('Home')
      expect(afterBody.data.topPages[0]?.editHref).toMatch(/^\/admin\/collections\/page\/.+/)
      expect(afterBody.data.topReferrers).toEqual([{ domain: 'search.example', views: 1 }])
    } finally {
      await server.stop()
    }
  })

  it('refuses the summary to a non-admin actor', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const { createSqliteHandle } = await import('@cogenta/core')
      const { createUserStore, createCredentialStore, ensureAuthTables } = await import(
        '@cogenta/auth'
      )
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)
      const user = await users.create({ email: 'editor@example.com', roles: ['editor'] })
      await credentials.setPassword(user.id, 'correct horse battery staple')
      await db.close()

      const loginResponse = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'editor@example.com',
          password: 'correct horse battery staple',
        }),
      })
      const loginBody = (await loginResponse.json()) as { data: { session?: { token: string } } }
      const token = loginBody.data.session?.token
      expect(token).toBeDefined()

      const response = await fetch(`${server.base}/api/analytics/summary`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('never breaks page rendering when the beacon path is malformed', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/api/analytics/beacon`)
      expect(response.status).toBe(204)
    } finally {
      await server.stop()
    }
  })

  it('reports per-page stats (views, previous period, rank) at /api/analytics/page', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const admin = await createAdmin(root, server.base)
      const page = await fetch(`${server.base}/home`)
      const html = await page.text()
      const beaconUrlMatch = html.match(/<img src="([^"]*analytics\/beacon[^"]*)"/)
      const beaconPath = beaconUrlMatch?.[1]?.replace(/&amp;/g, '&')
      expect(beaconPath).toBeDefined()
      await fetch(`${server.base}${beaconPath}`)

      const response = await fetch(`${server.base}/api/analytics/page?path=%2Fhome&days=7`, {
        headers: { authorization: `Bearer ${admin}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { path: string; views: number; rank: number | null; rankedPages: number }
      }
      expect(body.data.path).toBe('/home')
      expect(body.data.views).toBe(1)
      expect(body.data.rank).toBe(1)
      expect(body.data.rankedPages).toBe(1)
    } finally {
      await server.stop()
    }
  })
})

describe('analytics — retention purge', () => {
  it('purges an event past its configured retention on the very first tick', async () => {
    const root = await project({ analyticsRetainDays: 1 })

    // Seed one event 10 days in the past and one from just now, directly
    // through the real store — before the server (and its purge tick) ever
    // starts, so the very first sweep is what is under test.
    const { createSqliteHandle } = await import('@cogenta/core')
    const { createAnalyticsStore, ensureAnalyticsTables } = await import('@cogenta/analytics')
    const seedDb = await createSqliteHandle({ url: join(root, 'site.db') })
    await ensureAnalyticsTables(seedDb)
    const seedStore = createAnalyticsStore(seedDb)
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
    await seedStore.recordEvent({ path: '/ancient', ip: '203.0.113.5' }, tenDaysAgo)
    await seedStore.recordEvent({ path: '/recent', ip: '203.0.113.6' }, Date.now())
    await seedDb.close()

    const server = await startServer(root, { analyticsPurgeTickMs: 24 * 60 * 60 * 1000 })
    try {
      const admin = await createAdmin(root, server.base)
      const response = await fetch(`${server.base}/api/analytics/summary?days=90`, {
        headers: { authorization: `Bearer ${admin}` },
      })
      const body = (await response.json()) as {
        data: { totalViews: number; topPages: readonly { path: string }[] }
      }
      // The 10-day-old event, past the 1-day retention configured above, was
      // dropped by the tick `runServe` fires once immediately at startup;
      // the recent one survives.
      expect(body.data.totalViews).toBe(1)
      expect(body.data.topPages.map((page) => page.path)).toEqual(['/recent'])
    } finally {
      await server.stop()
    }
  })
})
