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

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-analytics-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Analytics test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
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

async function startServer(root: string): Promise<{ base: string; stop: () => Promise<void> }> {
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
          topPages: readonly { path: string; views: number }[]
          topReferrers: readonly { domain: string; views: number }[]
        }
      }
      expect(afterBody.data.totalViews).toBe(1)
      expect(afterBody.data.uniqueVisitors).toBe(1)
      expect(afterBody.data.topPages).toEqual([{ path: '/home', views: 1 }])
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
})
