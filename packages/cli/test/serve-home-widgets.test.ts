import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `/` and the home page's own path are the same page, so they have to render
 * the same page.
 *
 * `resolveEntry` retries `/` as `reading.homePath` (`/home` by default) and
 * finds the right entry, but the render then ran with the *requested* path,
 * and the widget context was derived from it: `kind: pathname === '/' ?
 * 'home' : 'entry'`. One entry, two different contexts depending on which
 * URL a visitor arrived through.
 *
 * Which side was wrong matters, and it is not the obvious one. The
 * `restaurant` blueprint places its widgets "everywhere except the home
 * page" (`mode: 'except'`, target `{ kind: 'home' }`). On `/` that target
 * matched and the widgets were correctly hidden; on `/home` it did not, and
 * they leaked onto the very page the editor had excluded. The audit measured
 * five widget areas on `/home` against none on `/` and read it as `/` losing
 * them — it was `/home` showing what nobody asked for.
 */

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-home-widgets-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Home Site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default [
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

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function publishHome(base: string, token: string): Promise<void> {
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ values: { title: 'Welcome', slug: 'home' } }),
    })
  ).json()) as { data: { id: string } }
  const published = await fetch(`${base}/api/content/page/${created.data.id}/publish`, {
    method: 'POST',
    headers: auth(token),
  })
  expect(published.status).toBe(200)
}

describe('the home page, reached either way', () => {
  it('places the same widgets whether a visitor arrives at / or at its own path', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery',
      )
      await publishHome(server.base, token)

      // Targeted at the home page as such…
      const targetedAtHome = await fetch(`${server.base}/api/widgets`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          area: 'sidebar',
          type: 'search',
          title: 'Ciblé page d accueil',
          visibility: { pages: { mode: 'only', targets: [{ kind: 'home' }] } },
        }),
      })
      expect(targetedAtHome.status).toBe(201)

      // …and the shape every blueprint actually uses: everywhere but home.
      const everywhereButHome = await fetch(`${server.base}/api/widgets`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          area: 'sidebar',
          type: 'quote',
          title: null,
          settings: { text: 'Partout sauf accueil' },
          visibility: { pages: { mode: 'except', targets: [{ kind: 'home' }] } },
        }),
      })
      expect(everywhereButHome.status).toBe(201)

      const atRoot = await fetch(`${server.base}/`)
      const atSlug = await fetch(`${server.base}/home`)
      expect(atRoot.status).toBe(200)
      expect(atSlug.status).toBe(200)

      const rootHtml = await atRoot.text()
      const slugHtml = await atSlug.text()

      for (const html of [rootHtml, slugHtml]) {
        // Targeted at home: shown, whichever URL reached it.
        expect(html).toContain('Ciblé page d accueil')
        // Excluded from home: hidden, whichever URL reached it. This is the
        // one that leaked on `/home`.
        expect(html).not.toContain('Partout sauf accueil')
      }

      const areas = (html: string): number =>
        (html.match(/class="[^"]*cg-widget-area/g) ?? []).length
      expect(areas(rootHtml)).toBe(areas(slugHtml))
    } finally {
      await server.stop()
    }
  }, 120_000)
})
