import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * L10 tasks 1-2, end to end against a real server and a real SQLite database.
 *
 * Everything here goes over HTTP to a `cogenta serve` that read the same
 * schema and wrote the same rows a real site would — the lot's own warning is
 * that `@cogenta/seo` had never run against a real server, so asserting on
 * the package's return values again would prove nothing new.
 */

/**
 * One typed source of truth for the fixture: the same array is serialised
 * into the project's `cogenta.schema.mjs` (what the server reads) and used
 * directly to build the store the seeding writes through, so the two can
 * never drift apart.
 */
const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      excerpt: { kind: 'text', options: { max: 400 } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
  {
    name: 'note',
    labels: { singular: 'Note', plural: 'Notes' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
]

const PAGE_COLLECTION = COLLECTIONS[0] as CollectionDefinition

const SCHEMA = `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`

async function project(locales?: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-seo-'))
  const site =
    locales === undefined
      ? `{ name: 'Test site', url: 'https://example.com' }`
      : `{ name: 'Test site', url: 'https://example.com', locales: ${JSON.stringify(locales)}, defaultLocale: ${JSON.stringify(locales[0])} }`
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: ${site},
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), SCHEMA, 'utf8')
  return root
}

const activeServers: AbortController[] = []

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

interface SeedEntry {
  readonly title: string
  readonly slug: string
  readonly excerpt?: string
  readonly locale?: string
  readonly translationOf?: string
  readonly publish?: boolean
}

/**
 * Writes real rows through the real `ContentStore`, against the same SQLite
 * file the running server uses. Nothing is mocked: `publish()` here is the
 * same call `POST /api/content/page/{id}/publish` makes.
 */
async function seed(root: string, entries: readonly SeedEntry[]): Promise<readonly string[]> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createContentStore } = await import('@cogenta/schema')

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  const store = createContentStore({ db, collection: PAGE_COLLECTION })
  const ids: string[] = []
  try {
    for (const input of entries) {
      const created = await store.create({
        values: {
          title: input.title,
          slug: input.slug,
          ...(input.excerpt === undefined ? {} : { excerpt: input.excerpt }),
        },
        ...(input.locale === undefined ? {} : { locale: input.locale }),
        ...(input.translationOf === undefined ? {} : { translationOf: input.translationOf }),
      })
      ids.push(created.id)
      if (input.publish !== false) await store.publish(created.id)
    }
  } finally {
    await db.close()
  }
  return ids
}

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

describe('cogenta serve — SEO in the rendered page (L10 task 1)', () => {
  it('a rendered page carries a real title, description, canonical, Open Graph and JSON-LD derived from the entry', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      await seed(root, [
        { title: 'Hello world', slug: 'hello-world', excerpt: 'A first post about nothing.' },
      ])

      const response = await fetch(`${server.base}/hello-world`)
      expect(response.status).toBe(200)
      const html = await response.text()

      expect(html).toContain('<title>Hello world</title>')
      expect(html).toContain('<meta name="description" content="A first post about nothing." />')
      expect(html).toContain('<link rel="canonical" href="https://example.com/hello-world" />')
      expect(html).toContain('<meta property="og:title" content="Hello world" />')
      expect(html).toContain('<meta property="og:site_name" content="Test site" />')
      expect(html).toContain('<meta property="og:url" content="https://example.com/hello-world" />')
      expect(html).toContain('<meta name="twitter:card" content="summary" />')

      const jsonLd = /<script type="application\/ld\+json">(.*?)<\/script>/su.exec(html)?.[1]
      expect(jsonLd).toBeDefined()
      const graph = JSON.parse(
        (jsonLd ?? '')
          .replace(/\\u003c/gu, '<')
          .replace(/\\u003e/gu, '>')
          .replace(/\\u0026/gu, '&'),
      ) as Record<string, unknown>
      expect(graph['@context']).toBe('https://schema.org')
      expect(graph['@type']).toBe('WebPage')
      expect(graph['@id']).toBe('https://example.com/hello-world')
      expect(graph['name']).toBe('Hello world')
      expect(graph['inLanguage']).toBe('en')
    } finally {
      await server.stop()
    }
  })

  it('emits reciprocal hreflang alternates for a linked translation, and none on a single-locale site', async () => {
    const multilingual = await project(['en', 'fr'])
    const server = await startServer(multilingual)
    try {
      const [sourceId] = await seed(multilingual, [
        { title: 'Hello world', slug: 'hello-world', locale: 'en' },
      ])
      if (sourceId === undefined) throw new Error('seed produced no source entry')
      await seed(multilingual, [
        { title: 'Bonjour', slug: 'bonjour', locale: 'fr', translationOf: sourceId },
      ])

      const english = await (await fetch(`${server.base}/hello-world`)).text()
      const french = await (await fetch(`${server.base}/bonjour`)).text()

      for (const html of [english, french]) {
        expect(html).toContain(
          '<link rel="alternate" hreflang="en" href="https://example.com/hello-world" />',
        )
        expect(html).toContain(
          '<link rel="alternate" hreflang="fr" href="https://example.com/bonjour" />',
        )
        // The source entry is the only defensible x-default (ADR-0014).
        expect(html).toContain(
          '<link rel="alternate" hreflang="x-default" href="https://example.com/hello-world" />',
        )
      }
      expect(english).toContain('<meta property="og:locale:alternate" content="fr" />')
      expect(french).toContain('<meta property="og:locale:alternate" content="en" />')
    } finally {
      await server.stop()
    }

    const monolingual = await project()
    const single = await startServer(monolingual)
    try {
      await seed(monolingual, [{ title: 'Alone', slug: 'alone' }])
      const html = await (await fetch(`${single.base}/alone`)).text()
      expect(html).not.toContain('rel="alternate"')
    } finally {
      await single.stop()
    }
  })
})

describe('cogenta serve — sitemap, robots and redirects (L10 task 2)', () => {
  it('serves a sitemap built from the published content, and never from the draft half of it', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      await seed(root, [
        { title: 'Published', slug: 'published' },
        { title: 'Still a draft', slug: 'still-a-draft', publish: false },
      ])

      const response = await fetch(`${server.base}/sitemap.xml`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/xml')
      const xml = await response.text()

      expect(xml).toContain('<loc>https://example.com/published</loc>')
      expect(xml).not.toContain('still-a-draft')
      // `note` has no routing, so it contributes no URL however many entries it holds.
      expect(xml).not.toContain('/note')
    } finally {
      await server.stop()
    }
  })

  it('serves a robots.txt that names the sitemap and keeps crawlers out of the admin', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/robots.txt`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/plain')
      const text = await response.text()

      expect(text).toContain('User-agent: *')
      expect(text).toContain('Disallow: /admin')
      expect(text).toContain('Sitemap: https://example.com/sitemap.xml')
    } finally {
      await server.stop()
    }
  })

  it('answers a stored redirect with a real 301 before any route is matched', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      await seed(root, [{ title: 'New home', slug: 'new-home' }])

      const { createSqliteHandle } = await import('@cogenta/core')
      const { createRedirectStore } = await import('@cogenta/schema')
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      const redirects = createRedirectStore({ db })
      await redirects.add({ from: '/old-home', to: '/new-home', reason: 'slug-change' })
      await db.close()

      const response = await fetch(`${server.base}/old-home`, { redirect: 'manual' })
      expect(response.status).toBe(301)
      expect(response.headers.get('location')).toBe('/new-home')

      // And a query string survives the hop: dropping it loses campaign
      // parameters on every renamed URL.
      const withQuery = await fetch(`${server.base}/old-home?utm_source=test`, {
        redirect: 'manual',
      })
      expect(withQuery.headers.get('location')).toBe('/new-home?utm_source=test')
    } finally {
      await server.stop()
    }
  })
})
