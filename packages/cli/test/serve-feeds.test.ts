import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `/feed.xml` and `/atom.xml` (audit 2026-09-01, 06-redirections-seo.md T03).
 *
 * `@cogenta/seo`'s feed renderers were written and unit-tested in L3 and
 * never reached a route — a Cogenta site simply had no feed, which is parity
 * every one of Ghost, WordPress and Hugo ships out of the box.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      excerpt: { kind: 'text', options: { max: 400 } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-feeds-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Feed Site', url: 'https://example.com' },
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

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function create(
  base: string,
  token: string,
  collection: string,
  values: Record<string, string>,
  publish: boolean,
): Promise<void> {
  const headers = auth(token)
  const created = (await (
    await fetch(`${base}/api/content/${collection}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ values }),
    })
  ).json()) as { data: { id: string } }
  if (publish) {
    await fetch(`${base}/api/content/${collection}/${created.data.id}/publish`, {
      method: 'POST',
      headers,
    })
  }
}

describe('RSS and Atom feeds (audit T03)', () => {
  it('serves both feeds anonymously, with published entries only', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct-horse-battery',
      )
      await create(
        server.base,
        token,
        'article',
        { title: 'Published piece', slug: 'published-piece', excerpt: 'A real summary.' },
        true,
      )
      await create(
        server.base,
        token,
        'article',
        { title: 'Secret draft', slug: 'secret-draft' },
        false,
      )
      await create(server.base, token, 'page', { title: 'Home', slug: 'home' }, true)

      // No session at all: a feed reader has none, and must still be served.
      const rss = await fetch(`${server.base}/feed.xml`)
      expect(rss.status).toBe(200)
      expect(rss.headers.get('content-type')).toContain('application/rss+xml')
      const rssBody = await rss.text()
      expect(rssBody.startsWith('<?xml')).toBe(true)
      expect(rssBody).toContain('<rss')
      expect(rssBody).toContain('Published piece')
      expect(rssBody).toContain('https://example.com/blog/published-piece')
      expect(rssBody).toContain('A real summary.')
      // The one thing a feed can never take back.
      expect(rssBody).not.toContain('Secret draft')

      const atom = await fetch(`${server.base}/atom.xml`)
      expect(atom.status).toBe(200)
      expect(atom.headers.get('content-type')).toContain('application/atom+xml')
      const atomBody = await atom.text()
      expect(atomBody).toContain('xmlns="http://www.w3.org/2005/Atom"')
      expect(atomBody).toContain('Published piece')
      expect(atomBody).toContain('rel="self"')
      expect(atomBody).toContain('/atom.xml')
      expect(atomBody).not.toContain('Secret draft')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('advertises both feeds from the page head, and refuses a non-GET', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct-horse-battery',
      )
      await create(server.base, token, 'page', { title: 'Home', slug: 'home' }, true)

      const html = await (await fetch(`${server.base}/`)).text()
      expect(html).toContain(
        '<link rel="alternate" type="application/rss+xml" title="Feed Site" href="/feed.xml">',
      )
      expect(html).toContain(
        '<link rel="alternate" type="application/atom+xml" title="Feed Site" href="/atom.xml">',
      )

      const posted = await fetch(`${server.base}/feed.xml`, { method: 'POST' })
      expect(posted.status).toBe(405)
      expect(posted.headers.get('allow')).toBe('GET')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('serves a well-formed, empty feed on a site with nothing published', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const rss = await fetch(`${server.base}/feed.xml`)
      expect(rss.status).toBe(200)
      const body = await rss.text()
      expect(body).toContain('<channel>')
      expect(body).not.toContain('<item>')
    } finally {
      await server.stop()
    }
  }, 90_000)
})
