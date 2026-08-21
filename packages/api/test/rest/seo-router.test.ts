import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition, ContentStore } from '@cogenta/schema'
import { createContentStore, createSchemaTables, defineCollection, f } from '@cogenta/schema'
import type { SeoSite } from '@cogenta/seo'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import { createContentGateway } from '../../src/graphql/gateway.js'
import type { RestResponse } from '../../src/rest/http.js'
import type { SeoDiagnostics, SeoRouter } from '../../src/rest/seo-router.js'
import { createSeoRouter } from '../../src/rest/seo-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `/api/seo` — fiche 13 (SEO éditorial). Real SQLite, a real `ContentGateway`,
 * a real permission layer: the whole point of this router is that it never
 * re-derives a title, a description or a robots decision, so these tests are
 * about permissions and about the diagnostic actually catching the L10
 * `isPublished` regression class of bug — not about `@cogenta/seo` itself,
 * which has its own suite.
 */

const ARTICLE: CollectionDefinition = defineCollection({
  name: 'seo_route_article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 320 }),
    seoTitle: f.text({ max: 300 }),
    seoDescription: f.text({ max: 400 }),
    seoNoindex: f.boolean({ default: false }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
})

/** No `routing`: excluded from the sitemap for a structural reason, not a permission one. */
const AUTHOR: CollectionDefinition = defineCollection({
  name: 'seo_route_author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: { name: f.text({ required: true }) },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
})

/** Routed, but closed to `public`: excluded for a permission reason. */
const MEMO: CollectionDefinition = defineCollection({
  name: 'seo_route_memo',
  labels: { singular: 'Memo', plural: 'Memos' },
  routing: { pattern: '/memo/:slug' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title', unique: true }),
  },
  permissions: { read: ['editor', 'admin'], create: ['editor'], update: ['editor'] },
})

const COLLECTIONS = [ARTICLE, AUTHOR, MEMO]

const SITE: SeoSite = {
  baseUrl: 'https://example.com',
  name: 'Example',
  defaultLocale: 'en',
}

function actor(...roles: readonly string[]): AccessContext {
  const value: Actor = { id: roles.length === 0 ? null : 'user-1', roles }
  return { actor: value }
}

describe('/api/seo', () => {
  let directory: string
  let db: DatabaseHandle
  let router: SeoRouter
  let articleStore: ContentStore
  let memoStore: ContentStore

  const ask = (
    method: string,
    path: string,
    body?: unknown,
    context: AccessContext = { actor: ANONYMOUS },
  ): Promise<RestResponse> => router.handle({ method, path, query: {}, body }, context)

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-seo-route-'))
    db = await createSqliteHandle({ url: join(directory, 'seo.db') })
    await createSchemaTables(db, COLLECTIONS)

    const stores = new Map<string, ContentStore>()
    for (const collection of COLLECTIONS) {
      stores.set(collection.name, createContentStore({ db, collection }))
    }
    articleStore = stores.get(ARTICLE.name) as ContentStore
    memoStore = stores.get(MEMO.name) as ContentStore

    const gateway = createContentGateway({
      collections: COLLECTIONS,
      stores,
      permissions: createPermissionLayer({ collections: COLLECTIONS }),
    })

    router = createSeoRouter({
      collections: COLLECTIONS,
      gateway,
      permissions: createPermissionLayer({ collections: COLLECTIONS }),
      site: SITE,
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('POST /api/seo/preview', () => {
    it('returns the real, computed head — the same function the render path calls', async () => {
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world', excerpt: 'A short summary.' },
      })
      await articleStore.publish(created.id)

      const response = await ask(
        'POST',
        '/api/seo/preview',
        { collection: ARTICLE.name, id: created.id },
        actor('editor'),
      )

      expect(response.status).toBe(200)
      const data = (
        response.body as {
          data: {
            title: string
            description: string | null
            robots: string
            canonical: string | null
          }
        }
      ).data
      expect(data.title).toBe('Hello world')
      expect(data.description).toBe('A short summary.')
      // Same "aperçu lit la face working" rule the page builder's own preview
      // follows (L16): an editor previewing an entry reads its `working`
      // face, so `isPublished` correctly refuses it and the preview carries
      // `noindex` with no canonical, exactly as a real preview link would.
      expect(data.robots).toBe('noindex')
      expect(data.canonical).toBeNull()
    })

    it('reflects an unsaved seoTitle override, verbatim — the whole point of a live preview', async () => {
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world' },
      })
      await articleStore.publish(created.id)

      const response = await ask(
        'POST',
        '/api/seo/preview',
        { collection: ARTICLE.name, id: created.id, overrides: { seoTitle: 'A better title' } },
        actor('editor'),
      )

      const data = (response.body as { data: { title: string } }).data
      expect(data.title).toBe('A better title')
    })

    it('reports noindex when seoNoindex is set, saved or overridden', async () => {
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world' },
      })
      await articleStore.publish(created.id)

      const response = await ask(
        'POST',
        '/api/seo/preview',
        { collection: ARTICLE.name, id: created.id, overrides: { seoNoindex: true } },
        actor('editor'),
      )

      const data = (response.body as { data: { robots: string } }).data
      expect(data.robots).toBe('noindex')
    })

    it('follows update on the collection, not read or admin', async () => {
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world' },
      })
      await articleStore.publish(created.id)

      const anonymous = await ask('POST', '/api/seo/preview', {
        collection: ARTICLE.name,
        id: created.id,
      })
      expect(anonymous.status).toBe(403)

      const editor = await ask(
        'POST',
        '/api/seo/preview',
        { collection: ARTICLE.name, id: created.id },
        actor('editor'),
      )
      expect(editor.status).toBe(200)
    })

    it('404s an unknown entry rather than leaking whether it once existed', async () => {
      const response = await ask(
        'POST',
        '/api/seo/preview',
        { collection: ARTICLE.name, id: 'does-not-exist' },
        actor('editor'),
      )
      expect(response.status).toBe(404)
    })

    it('404s an unknown collection', async () => {
      const response = await ask(
        'POST',
        '/api/seo/preview',
        { collection: 'no_such_collection', id: 'x' },
        actor('editor'),
      )
      expect(response.status).toBe(404)
    })

    it('allows POST only', async () => {
      const response = await ask('GET', '/api/seo/preview', undefined, actor('editor'))
      expect(response.status).toBe(405)
      expect(response.headers['allow']).toBe('POST')
    })

    it('applies titleDefaults live, read fresh on every request rather than pinned at construction (fiche 21 task 3)', async () => {
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world', excerpt: 'A short summary.' },
      })
      await articleStore.publish(created.id)

      let template = '%title% — Example'
      const withDefaults = createSeoRouter({
        collections: COLLECTIONS,
        gateway: createContentGateway({
          collections: COLLECTIONS,
          stores: new Map([
            [ARTICLE.name, articleStore],
            [MEMO.name, memoStore],
          ]),
          permissions: createPermissionLayer({ collections: COLLECTIONS }),
        }),
        permissions: createPermissionLayer({ collections: COLLECTIONS }),
        site: SITE,
        titleDefaults: () => Promise.resolve({ titleTemplate: template }),
      })
      const askWithDefaults = (): Promise<RestResponse> =>
        withDefaults.handle(
          {
            method: 'POST',
            path: '/api/seo/preview',
            query: {},
            body: { collection: ARTICLE.name, id: created.id },
          },
          actor('editor'),
        )

      const first = (await askWithDefaults()).body as { data: { title: string } }
      expect(first.data.title).toBe('Hello world — Example')

      // Changed after the router was built — no restart, no re-construction.
      template = '%title% :: v2'
      const second = (await askWithDefaults()).body as { data: { title: string } }
      expect(second.data.title).toBe('Hello world :: v2')
    })
  })

  describe('GET /api/seo/diagnostics', () => {
    it('is admin-only', async () => {
      expect((await ask('GET', '/api/seo/diagnostics')).status).toBe(403)
      expect((await ask('GET', '/api/seo/diagnostics', undefined, actor('editor'))).status).toBe(
        403,
      )
      expect((await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))).status).toBe(200)
    })

    it('counts a published, routed, public entry into the sitemap total', async () => {
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world' },
      })
      await articleStore.publish(created.id)

      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.sitemap.totalUrls).toBe(1)
      expect(data.content.publishedCount).toBe(1)
    })

    it('never regresses the L10 isPublished bug: a published entry with no publishedAt field still counts', async () => {
      // `seo_route_article` declares no `publishedAt` field at all — exactly the
      // shape that made every page `noindex` and every sitemap empty before L10
      // task 1's fix. This is that regression, replayed permanently.
      const created = await articleStore.create({
        values: { title: 'Hello world', slug: 'hello-world' },
      })
      await articleStore.publish(created.id)

      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.sitemap.totalUrls).toBeGreaterThan(0)
      expect(data.anomalies.map((a) => a.code)).not.toContain('SITEMAP_EMPTY_WHILE_PUBLISHED')
    })

    it('reports why a collection is excluded: no route, and a role closed to public', async () => {
      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data

      const authorReport = data.sitemap.collections.find((c) => c.name === AUTHOR.name)
      expect(authorReport?.included).toBe(false)
      expect(authorReport?.reason).toMatch(/route/u)

      const memoReport = data.sitemap.collections.find((c) => c.name === MEMO.name)
      expect(memoReport?.included).toBe(false)
      expect(memoReport?.reason).toMatch(/public/u)
    })

    it('flags SITEMAP_EMPTY_WHILE_PUBLISHED when publishing happens in a collection the sitemap cannot see', async () => {
      const created = await memoStore.create({
        values: { title: 'Internal memo', slug: 'internal' },
      })
      await memoStore.publish(created.id)

      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.sitemap.totalUrls).toBe(0)
      expect(data.anomalies.map((a) => a.code)).toContain('SITEMAP_EMPTY_WHILE_PUBLISHED')
    })

    it('excludes a seoNoindex entry from the sitemap total and counts it separately', async () => {
      const created = await articleStore.create({
        values: { title: 'Hidden page', slug: 'hidden-page', seoNoindex: true },
      })
      await articleStore.publish(created.id)

      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.sitemap.totalUrls).toBe(0)
      expect(data.content.noindexCount).toBe(1)
    })

    it('detects a missing description and a title over the recommended length', async () => {
      const created = await articleStore.create({
        values: {
          title: 'A title so extremely long that it will not fit in a search result at all',
          slug: 'long-title',
        },
      })
      await articleStore.publish(created.id)

      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.content.missingDescriptionCount).toHaveLength(1)
      expect(data.content.tooLongTitleCount).toHaveLength(1)
    })

    it('groups two entries that render the same title as a duplicate', async () => {
      const first = await articleStore.create({ values: { title: 'Same title', slug: 'a' } })
      await articleStore.publish(first.id)
      const second = await articleStore.create({ values: { title: 'Same title', slug: 'b' } })
      await articleStore.publish(second.id)

      const response = await ask('GET', '/api/seo/diagnostics', undefined, actor('admin'))
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.content.duplicateTitles).toHaveLength(1)
      expect(data.content.duplicateTitles[0]?.entries).toHaveLength(2)
    })

    it('warns loudly when robots.txt would disallow everything', async () => {
      const disallowAll = createSeoRouter({
        collections: COLLECTIONS,
        gateway: createContentGateway({
          collections: COLLECTIONS,
          stores: new Map(
            COLLECTIONS.map((collection) => [
              collection.name,
              createContentStore({ db, collection }),
            ]),
          ),
          permissions: createPermissionLayer({ collections: COLLECTIONS }),
        }),
        permissions: createPermissionLayer({ collections: COLLECTIONS }),
        site: SITE,
        allowIndexing: false,
      })

      const response = await disallowAll.handle(
        { method: 'GET', path: '/api/seo/diagnostics', query: {} },
        actor('admin'),
      )
      const data = (response.body as { data: SeoDiagnostics }).data
      expect(data.robots.content).toContain('Disallow: /')
      expect(data.anomalies.map((a) => a.code)).toContain('ROBOTS_DISALLOWS_EVERYTHING')
    })

    it('allows GET only', async () => {
      const response = await ask('POST', '/api/seo/diagnostics', undefined, actor('admin'))
      expect(response.status).toBe(405)
      expect(response.headers['allow']).toBe('GET')
    })
  })
})
