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

  it("changes the site's principal menu from the admin, by location, without a redeploy (task 3)", async () => {
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

      // Two menus, neither named "main" — this is the header slot resolved
      // purely by `location`, never by a theme-specific name.
      const first = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'nav-a', locale: 'en', label: 'Nav A', location: 'primary' }),
      })
      const firstMenu = (await first.json()) as { data: { id: string } }
      await fetch(`${server.base}/api/menus/${firstMenu.data.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'url', label: 'From nav A', url: '/from-a' }),
      })

      const second = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'nav-b', locale: 'en', label: 'Nav B' }),
      })
      const secondMenu = (await second.json()) as { data: { id: string } }
      await fetch(`${server.base}/api/menus/${secondMenu.data.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'url', label: 'From nav B', url: '/from-b' }),
      })

      const beforeHtml = await (await fetch(`${server.base}/`)).text()
      expect(beforeHtml).toContain('<a href="/from-a">From nav A</a>')
      expect(beforeHtml).not.toContain('From nav B')

      // Reassign the location — the same "change the principal menu" move an
      // admin makes, with no restart of the process in between.
      await fetch(`${server.base}/api/menus/${firstMenu.data.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ location: null }),
      })
      await fetch(`${server.base}/api/menus/${secondMenu.data.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ location: 'primary' }),
      })

      const afterHtml = await (await fetch(`${server.base}/`)).text()
      expect(afterHtml).toContain('<a href="/from-b">From nav B</a>')
      expect(afterHtml).not.toContain('From nav A')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('signals an unpublished link target to a draft-capable admin, and hides it from the public render (task 4)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const home = await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'published', values: { title: 'Home', slug: 'home' } }),
      })
      expect(home.status).toBe(201)

      const about = await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'published', values: { title: 'About', slug: 'about' } }),
      })
      expect(about.status).toBe(201)
      const aboutEntry = (await about.json()) as { data: { id: string } }

      const createdMenu = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'main', locale: 'en', label: 'Main menu' }),
      })
      const menu = (await createdMenu.json()) as { data: { id: string } }
      const createdItem = await fetch(`${server.base}/api/menus/${menu.data.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'entry',
          label: 'About',
          targetCollection: 'page',
          targetEntryId: aboutEntry.data.id,
        }),
      })
      expect(createdItem.status).toBe(201)

      const publishedHtml = await (await fetch(`${server.base}/`)).text()
      expect(publishedHtml).toContain('/about')

      // Take the target off its public face — the classic cause of a dead
      // link in a menu, per the fiche.
      const unpublished = await fetch(
        `${server.base}/api/content/page/${aboutEntry.data.id}/unpublish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ status: 'draft' }),
        },
      )
      expect(unpublished.status).toBe(200)

      const adminView = await fetch(`${server.base}/api/menus/${menu.data.id}`, { headers })
      const adminBody = (await adminView.json()) as {
        data: { items: readonly { resolvedHealth?: string }[] }
      }
      expect(adminBody.data.items[0]?.resolvedHealth).toBe('draft')

      const anonymousView = await fetch(`${server.base}/api/menus/${menu.data.id}`)
      const anonymousBody = (await anonymousView.json()) as {
        data: { items: readonly { resolvedHealth?: string }[] }
      }
      // A public caller never learns that a draft exists behind this item.
      expect(anonymousBody.data.items[0]?.resolvedHealth).toBeUndefined()

      const publicHtml = await (await fetch(`${server.base}/`)).text()
      expect(publicHtml).not.toContain('/about')
      expect(publicHtml).not.toContain('>About<')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('renders target="_blank"/rel="noopener" and the title attribute on a public link (task 4)', async () => {
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

      const createdMenu = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'main', locale: 'en', label: 'Main menu' }),
      })
      const menu = (await createdMenu.json()) as { data: { id: string } }
      const createdItem = await fetch(`${server.base}/api/menus/${menu.data.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'url',
          label: 'Docs',
          url: 'https://example.org/docs',
          title: 'Opens the documentation site',
          openInNewTab: true,
        }),
      })
      expect(createdItem.status).toBe(201)

      const html = await (await fetch(`${server.base}/`)).text()
      expect(html).toContain(
        '<a href="https://example.org/docs" target="_blank" rel="noopener" title="Opens the documentation site">Docs</a>',
      )
    } finally {
      await server.stop()
    }
  }, 60_000)
})
