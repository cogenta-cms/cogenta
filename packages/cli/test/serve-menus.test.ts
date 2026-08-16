import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Task 2 (audit follow-up to L13's menu system): the backend, `/api/menus/*`
 * and the admin screen were complete and tested, but no menu ever reached the
 * public theme. This proves the real thing, against a real server: a menu
 * named `main`, created through the same API the admin uses, shows up as a
 * real link in the HTML of the site's home page.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-menus-'))
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

/** Editor: may publish content *and* write menus (`assertWriteAccess` in `menu-router.ts` allows `admin` or `editor`). */
async function editorToken(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

describe('cogenta serve — menus rendered on the public site', () => {
  it('renders a "main" menu item as a real link on the home page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      // A real home page, published — `/` retries as `/home`.
      const page = await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'published', values: { title: 'Home', slug: 'home' } }),
      })
      expect(page.status).toBe(201)

      const createdMenu = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'main', locale: 'en', label: 'Main menu' }),
      })
      expect(createdMenu.status).toBe(201)
      const menu = (await createdMenu.json()) as { data: { id: string } }

      const createdItem = await fetch(`${server.base}/api/menus/${menu.data.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'url', label: 'About us', url: '/about' }),
      })
      expect(createdItem.status).toBe(201)

      const home = await fetch(`${server.base}/`)
      expect(home.status).toBe(200)
      const html = await home.text()

      expect(html).toContain('<a href="/about">About us</a>')
      // In the header, not just anywhere on the page.
      expect(html).toMatch(/<header[^>]*>[\s\S]*<a href="\/about">About us<\/a>[\s\S]*<\/header>/u)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('renders a "footer" menu in the footer, independently of "main"', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const page = await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'published', values: { title: 'Home', slug: 'home' } }),
      })
      expect(page.status).toBe(201)

      const createdMenu = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'footer', locale: 'en', label: 'Footer menu' }),
      })
      const menu = (await createdMenu.json()) as { data: { id: string } }
      await fetch(`${server.base}/api/menus/${menu.data.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'url', label: 'Privacy policy', url: '/privacy' }),
      })

      const home = await fetch(`${server.base}/`)
      const html = await home.text()

      expect(html).toMatch(
        /<footer[^>]*>[\s\S]*<a href="\/privacy">Privacy policy<\/a>[\s\S]*<\/footer>/u,
      )
      // No "main" menu was ever created, so the header slot stays empty —
      // unchanged behaviour for a site with no navigation configured.
      expect(html).not.toMatch(/<header[^>]*>[\s\S]*<nav[\s\S]*<\/header>/u)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('leaves the header and footer exactly as before when no menu exists', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'published', values: { title: 'Home', slug: 'home' } }),
      })

      const home = await fetch(`${server.base}/`)
      expect(home.status).toBe(200)
      const html = await home.text()

      expect(html).not.toContain('<nav')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
