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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-widgets-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Widget Site', url: 'https://example.com' },
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

async function widget(base: string, token: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${base}/api/widgets`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { data: { id: string } }).data.id
}

/**
 * Widget areas, end to end (L30): placed from the admin API, shown by the
 * public site with the canonical theme (which places no area itself, so the
 * host does), with every visibility rule decided for the real request.
 */
describe('widget areas on the public site (L30)', () => {
  it('shows each widget where and to whom its rules say, whatever the theme', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await session(root, server.base)
      const cooking = await term(server.base, token, 'cooking', 'Cooking')
      await article(
        server.base,
        token,
        {
          title: 'Bread at home',
          slug: 'bread-at-home',
          excerpt: 'Flour, water, time.',
          topics: [cooking],
        },
        true,
      )
      await article(
        server.base,
        token,
        { title: 'Soup season', slug: 'soup-season', topics: [cooking] },
        true,
      )
      await article(server.base, token, { title: 'Unfinished', slug: 'unfinished' }, false)

      await widget(server.base, token, { area: 'sidebar', type: 'search', title: 'Find a story' })
      await widget(server.base, token, {
        area: 'sidebar',
        type: 'recentEntries',
        title: 'Latest',
        settings: { collection: 'article', count: 5, showExcerpt: true },
      })
      await widget(server.base, token, {
        area: 'sidebar',
        type: 'terms',
        title: 'Topics',
        settings: { taxonomy: 'topic' },
      })
      await widget(server.base, token, {
        area: 'sidebar',
        type: 'archives',
        title: 'Archives',
        settings: { collection: 'article' },
      })
      await widget(server.base, token, {
        area: 'content-after',
        type: 'cta',
        title: null,
        settings: { heading: 'Get the letter', label: 'Subscribe', href: '/subscribe' },
        visibility: {
          pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'article' }] },
        },
      })
      await widget(server.base, token, {
        area: 'footer-1',
        type: 'links',
        title: 'Elsewhere',
        settings: { items: [{ label: 'Colophon', href: '/colophon' }] },
      })
      await widget(server.base, token, {
        area: 'sidebar',
        type: 'quote',
        title: 'For members',
        settings: { text: 'Members only note' },
        visibility: { audience: 'members' },
      })
      const hidden = await widget(server.base, token, {
        area: 'sidebar',
        type: 'quote',
        title: 'Hidden',
        settings: { text: 'Never shown' },
      })
      await fetch(`${server.base}/api/widgets/${hidden}`, {
        method: 'PATCH',
        headers: auth(token),
        body: JSON.stringify({ enabled: false }),
      })
      const phoneOnly = await widget(server.base, token, {
        area: 'sidebar',
        type: 'quote',
        title: 'Phones',
        settings: { text: 'Small screens' },
        visibility: { devices: { desktop: false, tablet: false, mobile: true } },
      })

      const page = await (await fetch(`${server.base}/blog/bread-at-home`)).text()
      // Placed inside <main> by the host, since the theme places no area itself.
      const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'))
      expect(main).toContain('data-area="sidebar"')
      expect(main).toContain('data-area="content-after"')
      expect(main).toContain('Get the letter')
      expect(page).toContain('<h2 class="cg-widget__title">Find a story</h2>')
      expect(page).toContain('action="/search"')
      expect(page).toContain(
        '<a class="cg-widget__entry-title" href="/blog/soup-season">Soup season</a>',
      )
      // The entry being read is not recommended to itself, and a draft never shows.
      expect(page).not.toContain('href="/blog/bread-at-home">Bread at home</a>')
      expect(page).not.toContain('Unfinished')
      expect(page).toMatch(
        /<a class="cg-widget__terms-label" href="\/topic\/cooking">Cooking<\/a><span class="cg-widget__terms-count">2<\/span>/u,
      )
      expect(page).toMatch(/href="\/archive\/article\/\d{4}\/\d{2}"/u)
      expect(page).toContain('data-area="footer-1"')
      expect(page.indexOf('data-area="footer-1"')).toBeGreaterThan(page.indexOf('</main>'))
      expect(page).not.toContain('Members only note')
      expect(page).not.toContain('Never shown')
      expect(page).toContain(
        `data-widget-id="${phoneOnly}" data-hide-desktop="true" data-hide-tablet="true"`,
      )
      expect(page).toContain(':where(.cg-widget__title)')

      // The same site, signed in: the members' widget appears.
      const signedIn = await (
        await fetch(`${server.base}/blog/bread-at-home`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).text()
      expect(signedIn).toContain('Members only note')

      // A term archive: the sidebar is there, the article-only call to action is not.
      const archive = await (await fetch(`${server.base}/topic/cooking`)).text()
      expect(archive).toContain('data-area="sidebar"')
      expect(archive).not.toContain('Get the letter')
      expect(archive).toContain('aria-current="page"')

      // The search page carries the sidebar too.
      const search = await (await fetch(`${server.base}/search?q=bread`)).text()
      expect(search).toContain('Find a story')

      // The date archive a widget links to is a real page.
      const monthHref = /href="(\/archive\/article\/\d{4}\/\d{2})"/u.exec(page)?.[1] as string
      const month = await fetch(`${server.base}${monthHref}`)
      expect(month.status).toBe(200)
      const monthHtml = await month.text()
      expect(monthHtml).toContain('Soup season')
      expect(monthHtml).not.toContain('Unfinished')
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('follows a widget dropdown to a path on this site, and nowhere else', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const local = await fetch(`${server.base}/_cogenta/go?to=%2Ftopic%2Fcooking`, {
        redirect: 'manual',
      })
      expect(local.status).toBe(303)
      expect(local.headers.get('location')).toBe('/topic/cooking')
      for (const target of ['https://evil.example', '//evil.example', '/\\evil.example']) {
        const away = await fetch(`${server.base}/_cogenta/go?to=${encodeURIComponent(target)}`, {
          redirect: 'manual',
        })
        expect(away.headers.get('location')).toBe('/')
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses the widget API to anyone but an admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      expect((await fetch(`${server.base}/api/widgets`)).status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 60_000)
})
