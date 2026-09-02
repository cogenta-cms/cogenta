import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, matchPath } from '@cogenta/schema'
import {
  type FetchedEntries,
  type HtmlNode,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterEach, describe, expect, it } from 'vitest'
import { page, service, VITRINE_COLLECTIONS } from '../src/blueprints/vitrine.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — vitrine blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  // Audit fiche 06, T01 (P0): without these four fields, the admin's SEO
  // panel (`seo-panel.tsx`) renders nothing for every entry of every routed
  // collection this blueprint scaffolds. `testimonial` is deliberately
  // excluded — it has no `routing` of its own, so the panel is not
  // reachable for it in the first place.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [service, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('writes a schema file loadCollections can load back, with service/testimonial/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-vitrine-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Business',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'vitrine',
    })

    expect(result.blueprintId).toBe('vitrine')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'service', 'testimonial'])
  })

  it('seeds real demo services, testimonials and pages into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-vitrine-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Business',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'vitrine',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const serviceStore = createContentStore({ db: selection.instance, collection: service })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const services = await serviceStore.list()
      expect(services.items.length).toBeGreaterThanOrEqual(3)

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(['about', 'home'])
    } finally {
      await selection.dispose()
    }
  })

  it('resolves /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(VITRINE_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-vitrine-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Business',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'vitrine',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const serviceStore = createContentStore({ db: selection.instance, collection: service })

      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      expect(home).toBeDefined()
      if (home === undefined) throw new Error('unreachable')

      const pageContent: PageContent = {
        title: home.values.title as string,
        blocks: (home.blocks.blocks ?? []).map(
          (block): VocabularyBlock =>
            ({
              _key: block.key,
              _type: block.type,
              _version: '1.0.0',
              ...block.data,
            }) as VocabularyBlock,
        ),
      }

      const services = await serviceStore.list()
      const themeEntries: readonly ThemeContentEntry[] = services.items.map((entry) => ({
        id: entry.id,
        collection: 'service',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext()
      const entries: FetchedEntries = { 'demo-home-services': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('A showcase site that says what you do')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Brand strategy')
    } finally {
      await selection.dispose()
    }
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(): RenderContext {
  return {
    site: {
      name: 'My Business',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    image: () => {
      throw new Error('not used by this test')
    },
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      return buildPath(service, { slug: target.id })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
