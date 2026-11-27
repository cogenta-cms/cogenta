import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * What a taxonomy term's public page shows, chosen per term, end to end.
 *
 * The choice is a host-owned presentation setting kept outside contract A
 * (a term has no such field, ADR-0022), set through
 * `PUT /api/taxonomies/{taxonomy}/{id}/archive-display`. Everything here runs
 * against a real server, a real SQLite file and the real permission-checked
 * gateway — the five modes, the sitemap rule that follows from them, and the
 * route's permissions.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-archive-display-'))
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

const EMPTY_MESSAGE = 'Nothing is filed here yet.'

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function term(base: string, token: string, slug: string, parent?: string): Promise<string> {
  const response = await fetch(`${base}/api/taxonomies/topic`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      slug,
      labels: { en: slug },
      ...(parent === undefined ? {} : { parent }),
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { data: { id: string } }).data.id
}

async function article(base: string, token: string, title: string, topic: string): Promise<void> {
  const created = await fetch(`${base}/api/content/article`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      values: { title, slug: title.toLowerCase().replace(/\s+/gu, '-'), topics: [topic] },
    }),
  })
  expect(created.status).toBe(201)
  const id = ((await created.json()) as { data: { id: string } }).data.id
  const published = await fetch(`${base}/api/content/article/${id}/publish`, {
    method: 'POST',
    headers: auth(token),
  })
  expect(published.status).toBe(200)
}

async function setMode(base: string, token: string, termId: string, mode: string): Promise<void> {
  const response = await fetch(`${base}/api/taxonomies/topic/${termId}/archive-display`, {
    method: 'PUT',
    headers: auth(token),
    body: JSON.stringify({ mode }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ data: { mode } })
}

async function page(base: string, slug: string): Promise<string> {
  const response = await fetch(`${base}/topic/${slug}`)
  expect(response.status).toBe(200)
  return response.text()
}

/** cuisine (own entry) > desserts (own entry) > tarts (own entry). */
async function seed(
  base: string,
  token: string,
): Promise<{ readonly cuisine: string; readonly desserts: string; readonly tarts: string }> {
  const cuisine = await term(base, token, 'cuisine')
  const desserts = await term(base, token, 'desserts', cuisine)
  const tarts = await term(base, token, 'tarts', desserts)
  await article(base, token, 'Braising slowly', cuisine)
  await article(base, token, 'Chocolate cake', desserts)
  await article(base, token, 'Lemon tart', tarts)
  return { cuisine, desserts, tarts }
}

async function signedIn(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

describe('the display mode of a term archive page', () => {
  it('shows only the term’s own entries, with no sub-term list, when nothing was chosen', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const ids = await seed(server.base, token)

      const html = await page(server.base, 'cuisine')
      expect(html).toContain('Braising slowly')
      expect(html).not.toContain('Chocolate cake')
      expect(html).not.toContain('Lemon tart')
      expect(html).not.toContain('href="/topic/desserts"')

      const read = await fetch(`${server.base}/api/taxonomies/topic/${ids.cuisine}/archive-display`)
      expect(await read.json()).toEqual({ data: { mode: 'entries' } })
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('shows only the sub-term list in subterms mode: no entries and no "nothing filed" message', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const { cuisine } = await seed(server.base, token)
      await setMode(server.base, token, cuisine, 'subterms')

      const html = await page(server.base, 'cuisine')
      expect(html).toContain('href="/topic/desserts"')
      // Direct sub-terms only, not the grandchild.
      expect(html).not.toContain('href="/topic/tarts"')
      expect(html).not.toContain('Braising slowly')
      expect(html).not.toContain('Chocolate cake')
      expect(html).not.toContain(EMPTY_MESSAGE)
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('says nothing is filed, rather than going blank, for subterms mode on a term with no sub-terms', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const { tarts } = await seed(server.base, token)
      await setMode(server.base, token, tarts, 'subterms')

      const html = await page(server.base, 'tarts')
      expect(html).toContain(EMPTY_MESSAGE)
      expect(html).not.toContain('Lemon tart')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('shows the term’s own entries and the sub-term list in entries-and-subterms mode', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const { cuisine } = await seed(server.base, token)
      await setMode(server.base, token, cuisine, 'entries-and-subterms')

      const html = await page(server.base, 'cuisine')
      expect(html).toContain('Braising slowly')
      expect(html).toContain('href="/topic/desserts"')
      expect(html).not.toContain('Chocolate cake')
      expect(html).not.toContain('Lemon tart')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('folds in every descendant’s entries, newest first and once each, in subtree mode', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const { cuisine, desserts } = await seed(server.base, token)
      // Filed under both the parent and a child: listed once.
      const twice = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          values: { title: 'Twice filed', slug: 'twice-filed', topics: [cuisine, desserts] },
        }),
      })
      const twiceId = ((await twice.json()) as { data: { id: string } }).data.id
      await fetch(`${server.base}/api/content/article/${twiceId}/publish`, {
        method: 'POST',
        headers: auth(token),
      })
      await setMode(server.base, token, cuisine, 'subtree')

      const html = await page(server.base, 'cuisine')
      for (const title of ['Braising slowly', 'Chocolate cake', 'Lemon tart', 'Twice filed']) {
        expect(html).toContain(title)
      }
      // The *list* holds it once, though two of the subtree's terms carry it.
      expect(html.split('href="/blog/twice-filed"').length - 1).toBe(1)
      // Newest first: the last one written comes before the first.
      expect(html.indexOf('href="/blog/twice-filed"')).toBeLessThan(
        html.indexOf('href="/blog/braising-slowly"'),
      )
      // No sub-term list in this mode.
      expect(html).not.toContain('href="/topic/desserts"')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('shows the subtree’s entries and the sub-term list in subtree-and-subterms mode', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const { cuisine } = await seed(server.base, token)
      await setMode(server.base, token, cuisine, 'subtree-and-subterms')

      const html = await page(server.base, 'cuisine')
      expect(html).toContain('Lemon tart')
      expect(html).toContain('Chocolate cake')
      expect(html).toContain('href="/topic/desserts"')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('keeps unpublished entries of a subtree off the public page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const { cuisine, desserts } = await seed(server.base, token)
      await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          values: { title: 'Secret draft', slug: 'secret-draft', topics: [desserts] },
        }),
      })
      await setMode(server.base, token, cuisine, 'subtree')

      expect(await page(server.base, 'cuisine')).not.toContain('Secret draft')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('lists a term in the sitemap only when its page, under its mode, shows something', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      // `parent` classifies nothing itself; its child does.
      const parent = await term(server.base, token, 'parent')
      const child = await term(server.base, token, 'child', parent)
      await article(server.base, token, 'Child story', child)
      // `leaf` classifies nothing and has no sub-terms.
      const leaf = await term(server.base, token, 'leaf')

      const sitemap = async (): Promise<string> =>
        (await fetch(`${server.base}/sitemap.xml`)).text()
      const listed = (xml: string, slug: string): boolean =>
        xml.includes(`https://example.com/topic/${slug}<`)

      // Default: no entries of its own, so nothing to show.
      let xml = await sitemap()
      expect(listed(xml, 'parent')).toBe(false)
      expect(listed(xml, 'child')).toBe(true)
      expect(listed(xml, 'leaf')).toBe(false)

      // The sub-term list is something to show; the descendant's entries too.
      await setMode(server.base, token, parent, 'subterms')
      xml = await sitemap()
      expect(listed(xml, 'parent')).toBe(true)

      await setMode(server.base, token, parent, 'subtree')
      xml = await sitemap()
      expect(listed(xml, 'parent')).toBe(true)

      await setMode(server.base, token, parent, 'entries-and-subterms')
      xml = await sitemap()
      expect(listed(xml, 'parent')).toBe(true)

      // A sub-term list with no sub-terms is nothing.
      await setMode(server.base, token, leaf, 'subterms')
      xml = await sitemap()
      expect(listed(xml, 'leaf')).toBe(false)

      // Back to the default.
      await setMode(server.base, token, parent, 'entries')
      xml = await sitemap()
      expect(listed(xml, 'parent')).toBe(false)
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('refuses the public and accepts an editor on the route, and rejects an unknown mode', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signedIn(root, server.base)
      const cuisine = await term(server.base, token, 'cuisine')
      const url = `${server.base}/api/taxonomies/topic/${cuisine}/archive-display`

      const anonymous = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'subtree' }),
      })
      expect([401, 403]).toContain(anonymous.status)

      const unknown = await fetch(url, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify({ mode: 'everything' }),
      })
      expect(unknown.status).toBe(400)

      // Reading is reading the term: public.
      const read = await fetch(url)
      expect(read.status).toBe(200)
      expect(await read.json()).toEqual({ data: { mode: 'entries' } })
    } finally {
      await server.stop()
    }
  }, 90_000)
})
