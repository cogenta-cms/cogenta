import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * A `hero` or `cta` action whose target is an entry (`{ collection, id }`,
 * contract B "Actions") rendered as `#`: `link()` only knows the entries the
 * render fetched up front, and action targets were never among them.
 */

const PERMISSIONS = {
  read: ['public'],
  create: ['editor'],
  update: ['editor'],
  delete: ['admin'],
  publish: ['editor'],
}

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: PERMISSIONS,
  },
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      blocks: { kind: 'blocks', options: {} },
    },
    permissions: PERMISSIONS,
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-action-link-'))
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
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

describe('cogenta serve — actions that target an entry', () => {
  it('links a hero and a cta action to the entry they reference, following a slug change', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      const publish = (collection: string, id: string) =>
        fetch(`${server.base}/api/content/${collection}/${id}/publish`, { method: 'POST', headers })

      const article = (await (
        await fetch(`${server.base}/api/content/article`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Featured', slug: 'featured' } }),
        })
      ).json()) as { data: { id: string } }
      await publish('article', article.data.id)

      const target = { collection: 'article', id: article.data.id }
      const created = await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          values: { title: 'Landing', slug: 'landing' },
          blocks: {
            blocks: [
              {
                key: 'hero',
                type: 'hero',
                data: { title: 'Read this', actions: [{ label: 'Read the story', target }] },
              },
              {
                key: 'cta',
                type: 'cta',
                data: { title: 'Still here?', actions: [{ label: 'Go to the story', target }] },
              },
            ],
          },
        }),
      })
      expect(created.status).toBe(201)
      const page = (await created.json()) as { data: { id: string } }
      await publish('page', page.data.id)

      const before = await (await fetch(`${server.base}/landing`)).text()
      expect(before).not.toMatch(/href="#"/u)
      expect(before.match(/href="\/blog\/featured"/gu)?.length ?? 0).toBeGreaterThanOrEqual(2)

      await fetch(`${server.base}/api/content/article/${article.data.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'featured-renamed' } }),
      })
      await publish('article', article.data.id)

      const after = await (await fetch(`${server.base}/landing`)).text()
      expect(after).toContain('href="/blog/featured-renamed"')
      expect(after).not.toContain('href="/blog/featured"')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
