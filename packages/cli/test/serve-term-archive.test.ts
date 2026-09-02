import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * The public taxonomy-term archive, end to end (audit 2026-09-01,
 * 04-taxonomies-menus.md T01).
 *
 * ADR-0022 shipped taxonomies and the admin has let an editor point a menu
 * item at a term ever since — and `resolveMenuTerm` answered `route: null`
 * for every one of them, because no site rendered such a page. A term was a
 * filing cabinet with no door, structurally, for as long as that was true.
 *
 * Everything here runs against a real server, a real SQLite file and the
 * real permission-checked gateway.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-archive-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Archive Site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export const taxonomies = [
  {
    name: 'topic',
    labels: { singular: { en: 'Topic' } },
    hierarchical: true,
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      excerpt: { kind: 'text', options: { max: 400 } },
      topics: { kind: 'taxonomy', options: { of: 'topic', many: true } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
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

async function session(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

async function term(
  base: string,
  token: string,
  slug: string,
  label: string,
  parent?: string,
): Promise<string> {
  const response = await fetch(`${base}/api/taxonomies/topic`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      slug,
      labels: { en: label },
      ...(parent === undefined ? {} : { parent }),
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { data: { id: string } }).data.id
}

async function article(
  base: string,
  token: string,
  values: Record<string, unknown>,
  publish: boolean,
): Promise<string> {
  const created = await fetch(`${base}/api/content/article`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ values }),
  })
  expect(created.status).toBe(201)
  const id = ((await created.json()) as { data: { id: string } }).data.id
  if (publish) {
    await fetch(`${base}/api/content/article/${id}/publish`, {
      method: 'POST',
      headers: auth(token),
    })
  }
  return id
}

describe('the public term archive (audit T01)', () => {
  it('serves the entries filed under a term, anonymously, and hides the unpublished', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await session(root, server.base)
      const cooking = await term(server.base, token, 'cuisine', 'Cooking')
      const desserts = await term(server.base, token, 'desserts', 'Desserts', cooking)

      await article(
        server.base,
        token,
        {
          title: 'Braising, slowly',
          slug: 'braising-slowly',
          excerpt: 'A long afternoon.',
          topics: [cooking],
        },
        true,
      )
      await article(
        server.base,
        token,
        { title: 'Still a draft', slug: 'still-a-draft', topics: [cooking] },
        false,
      )
      await article(
        server.base,
        token,
        { title: 'A tart', slug: 'a-tart', topics: [desserts] },
        true,
      )

      // No session: a public archive is public.
      const response = await fetch(`${server.base}/topic/cuisine`)
      expect(response.status).toBe(200)
      const html = await response.text()

      expect(html).toContain('Cooking')
      expect(html).toContain('Braising, slowly')
      expect(html).toContain('href="/blog/braising-slowly"')
      expect(html).toContain('A long afternoon.')
      // Unpublished content never reaches a public page.
      expect(html).not.toContain('Still a draft')
      // The sub-term is offered as a link down the tree, but its entries are
      // not folded into the parent's list — a deliberate choice, documented.
      expect(html).toContain('href="/topic/desserts"')
      expect(html).not.toContain('A tart')

      // The site's own chrome is on the page, not a bare fragment.
      expect(html).toContain('cg-site-header')
      expect(html).toContain('cg-skip-link')
      expect(html).toContain('<link rel="canonical" href="https://example.com/topic/cuisine">')
      expect(html).toContain('content="index, follow"')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('answers 200 with an empty list for a term that classifies nothing, and 404 for a term that does not exist', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await session(root, server.base)
      await term(server.base, token, 'empty', 'Empty')

      const empty = await fetch(`${server.base}/topic/empty`)
      expect(empty.status).toBe(200)
      expect(await empty.text()).toContain('Empty')

      // A term nobody created, and a taxonomy nobody declared: both are
      // ordinary 404s, like any other unresolved path.
      expect((await fetch(`${server.base}/topic/nope`)).status).toBe(404)
      expect((await fetch(`${server.base}/not-a-taxonomy/nope`)).status).toBe(404)
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('turns a taxonomy menu item into a real link, and lists the term in the sitemap', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await session(root, server.base)
      const cooking = await term(server.base, token, 'cuisine', 'Cooking')
      await article(
        server.base,
        token,
        { title: 'Braising', slug: 'braising', topics: [cooking] },
        true,
      )

      const created = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ name: 'main', locale: 'en', label: 'Main menu' }),
      })
      expect(created.status).toBe(201)
      const menu = ((await created.json()) as { data: { id: string } }).data

      const added = await fetch(`${server.base}/api/menus/${menu.id}/items`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          kind: 'taxonomy',
          label: 'Cooking',
          targetTaxonomy: 'topic',
          targetTermId: cooking,
        }),
      })
      expect(added.status).toBe(201)

      // The resolver used to answer `route: null` for every taxonomy item,
      // for as long as no archive page existed to point at.
      const resolved = (await (
        await fetch(`${server.base}/api/menus/${menu.id}`, { headers: auth(token) })
      ).json()) as {
        data: { items: readonly { label: string; resolvedRoute: string | null }[] }
      }
      const item = resolved.data.items.find((candidate) => candidate.label === 'Cooking')
      expect(item?.resolvedRoute).toBe('/topic/cuisine')

      // And it is a real link on the real page, not a dead <span>.
      // A real link in the site chrome, not a dead <span>. Asserted on the
      // archive page itself: this project declares no `page` collection, so
      // `/` has nothing to render.
      const html = await (await fetch(`${server.base}/topic/cuisine`)).text()
      expect(html).toContain('href="/topic/cuisine"')

      const sitemap = await (await fetch(`${server.base}/sitemap.xml`)).text()
      expect(sitemap).toContain('https://example.com/topic/cuisine')
    } finally {
      await server.stop()
    }
  }, 90_000)
})
