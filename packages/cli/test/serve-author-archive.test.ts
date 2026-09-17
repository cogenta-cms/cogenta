import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer } from './helpers/serve-harness.js'

/**
 * L37 — the author archive, WordPress's `/author/…` page, at
 * `/archive/author/{slug}`: what a byline links to, listing what the author
 * published. Only an account that gave itself a public name and published
 * something dated has one; any other slug is a 404, so the URL space never
 * lists the site's accounts.
 */

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

const SCHEMA = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, unique: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
  {
    name: 'post',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, unique: true, options: { from: 'title' } },
      excerpt: { kind: 'text', options: { max: 300 } },
      publishedAt: { kind: 'datetime', options: {} },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

interface Seeded {
  readonly root: string
}

async function seededSite(): Promise<Seeded> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-author-archive-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Site', url: 'https://example.com', locales: ['fr'], defaultLocale: 'fr' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(SCHEMA, null, 2)}\n`,
    'utf8',
  )

  const { createSqliteHandle } = await import('@cogenta/core')
  const { createContentStore, createSchemaTables, defineCollection } = await import(
    '@cogenta/schema'
  )
  const { createUserStore, ensureAuthTables } = await import('@cogenta/auth')
  const collections = SCHEMA.map((definition) =>
    defineCollection(definition as Parameters<typeof defineCollection>[0]),
  )
  const [page, post] = collections as [(typeof collections)[number], (typeof collections)[number]]
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  await createSchemaTables(db, collections)
  const users = createUserStore(db)

  const camille = await users.create({ email: 'camille@example.com', roles: ['editor'] })
  await users.updateProfile(camille.id, {
    displayName: 'Camille Durand',
    bio: 'Ingénieure réseaux, elle écrit sur la maintenance prédictive.',
  })
  const homonym = await users.create({ email: 'other.camille@example.com', roles: ['editor'] })
  await users.updateProfile(homonym.id, { displayName: 'Camille Durand' })
  const pagesOnly = await users.create({ email: 'admin@example.com', roles: ['admin'] })
  await users.updateProfile(pagesOnly.id, { displayName: 'Administratrice' })
  const anonymous = await users.create({ email: 'nobody@example.com', roles: ['editor'] })

  const posts = createContentStore({ db, collection: post, defaultLocale: 'fr' })
  const pages = createContentStore({ db, collection: page, defaultLocale: 'fr' })
  await posts.create({
    status: 'published',
    createdBy: camille.id,
    values: {
      title: 'Capteurs et vibrations',
      slug: 'capteurs-vibrations',
      excerpt: 'Ce que mesurent les capteurs.',
      publishedAt: '2026-03-01T09:00:00.000Z',
    },
  })
  await posts.create({
    status: 'published',
    createdBy: camille.id,
    values: {
      title: 'Dix secondes',
      slug: 'dix-secondes',
      publishedAt: '2026-04-01T09:00:00.000Z',
    },
  })
  await posts.create({
    status: 'draft',
    createdBy: camille.id,
    values: { title: 'Brouillon secret', slug: 'brouillon-secret' },
  })
  await posts.create({
    status: 'published',
    createdBy: homonym.id,
    values: {
      title: 'Un homonyme écrit',
      slug: 'homonyme',
      publishedAt: '2026-05-01T09:00:00.000Z',
    },
  })
  await posts.create({
    status: 'published',
    createdBy: anonymous.id,
    values: { title: 'Sans nom public', slug: 'sans-nom', publishedAt: '2026-05-02T09:00:00.000Z' },
  })
  await pages.create({
    status: 'published',
    createdBy: pagesOnly.id,
    values: { title: 'Mentions légales', slug: 'mentions-legales' },
  })
  await db.close()
  return { root }
}

describe('cogenta serve — author archives (L37)', () => {
  it('lists what an author published, with their bio, and links their byline to it', async () => {
    const { root } = await seededSite()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/archive/author/camille-durand`)
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Camille Durand')
      expect(html).toContain('Ingénieure réseaux, elle écrit sur la maintenance prédictive.')
      expect(html).toContain('href="/blog/capteurs-vibrations"')
      expect(html).toContain('href="/blog/dix-secondes"')
      expect(html).not.toContain('Brouillon secret')
      expect(html).not.toContain('Un homonyme écrit')
      expect(html).not.toContain('camille@example.com')

      const article = await (await fetch(`${server.base}/blog/capteurs-vibrations`)).text()
      expect(article).toContain('href="/archive/author/camille-durand"')
    } finally {
      await server.stop()
    }
  })

  it('gives a namesake their own address rather than merging two people', async () => {
    const { root } = await seededSite()
    const server = await startServer(root, { registry: activeServers })
    try {
      const article = await (await fetch(`${server.base}/blog/homonyme`)).text()
      const href = /href="(\/archive\/author\/camille-durand-[a-z0-9]+)"/u.exec(article)?.[1]
      expect(href).toBeDefined()
      const archive = await (await fetch(`${server.base}${href}`)).text()
      expect(archive).toContain('Un homonyme écrit')
      expect(archive).not.toContain('Capteurs et vibrations')
    } finally {
      await server.stop()
    }
  })

  it('has no page, and no link, for an account without a public name or anything dated published', async () => {
    const { root } = await seededSite()
    const server = await startServer(root, { registry: activeServers })
    try {
      // Only pages, never a dated entry: an administrator is not an author.
      expect((await fetch(`${server.base}/archive/author/administratrice`)).status).toBe(404)
      const legal = await (await fetch(`${server.base}/mentions-legales`)).text()
      expect(legal).not.toContain('/archive/author/')

      // No public name: nothing to show, nothing to find.
      const unnamed = await (await fetch(`${server.base}/blog/sans-nom`)).text()
      expect(unnamed).not.toContain('/archive/author/')
      expect((await fetch(`${server.base}/archive/author/nobody`)).status).toBe(404)
    } finally {
      await server.stop()
    }
  })

  it('lists author archives in the sitemap', async () => {
    const { root } = await seededSite()
    const server = await startServer(root, { registry: activeServers })
    try {
      const sitemap = await (await fetch(`${server.base}/sitemap.xml`)).text()
      const all = sitemap.includes('<sitemapindex')
        ? (
            await Promise.all(
              [...sitemap.matchAll(/<loc>https:\/\/example\.com(\/[^<]+)<\/loc>/gu)].map(
                async (m) => (await fetch(`${server.base}${m[1]}`)).text(),
              ),
            )
          ).join('\n')
        : sitemap
      expect(all).toContain('https://example.com/archive/author/camille-durand</loc>')
      expect(all).not.toContain('administratrice')
    } finally {
      await server.stop()
    }
  })
})
