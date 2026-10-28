import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { type CollectionDefinition, createContentStore } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer } from './helpers/serve-harness.js'

/**
 * RFC 9110 §9.3.2: HEAD is GET without a body — same status, same headers.
 * Monitors, link checkers and crawlers probe with it; a 404 or a 405 there
 * makes a healthy site look dead. End to end against a real server.
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

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-head-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Head site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify([PAGE])}\n`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

describe('cogenta serve — HEAD', () => {
  it.each([
    '/home',
    '/',
    '/no-such-page',
    '/robots.txt',
    '/sitemap.xml',
    '/admin',
    '/livez',
    '/readyz',
  ])(
    'answers HEAD %s like GET, headers included, with no body',
    async (path) => {
      const root = await project()
      const server = await startServer(root, { registry: activeServers })
      try {
        const db = await createSqliteHandle({ url: join(root, 'site.db') })
        try {
          const store = createContentStore({ db, collection: PAGE })
          const created = await store.create({ values: { title: 'Home', slug: 'home' } })
          await store.publish(created.id)
        } finally {
          await db.close()
        }

        const got = await fetch(`${server.base}${path}`)
        const body = await got.arrayBuffer()
        const head = await fetch(`${server.base}${path}`, { method: 'HEAD' })
        const headBody = await head.arrayBuffer()

        expect(head.status, path).toBe(got.status)
        expect(head.status, path).not.toBe(405)
        expect(headBody.byteLength, path).toBe(0)
        expect(head.headers.get('content-type'), path).toBe(got.headers.get('content-type'))
        expect(head.headers.get('cache-control'), path).toBe(got.headers.get('cache-control'))
        // Whatever length a GET advertises, HEAD advertises too (a chunked GET
        // has none to give), so a monitor can size the response.
        expect(head.headers.get('content-length'), path).toBe(got.headers.get('content-length'))
        expect(body.byteLength, path).toBeGreaterThan(0)
      } finally {
        await server.stop()
      }
    },
    60_000,
  )

  it('still refuses a write method with 405 or an error, never as a HEAD', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/robots.txt`, { method: 'POST' })
      expect(response.status).toBeGreaterThanOrEqual(400)
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
