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
import { menuItem, page, RESTAURANT_COLLECTIONS } from '../src/blueprints/restaurant.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — restaurant blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  // Audit fiche 06, T01 (P0): without these four fields, the admin's SEO
  // panel (`seo-panel.tsx`) renders nothing for every entry of every routed
  // collection this blueprint scaffolds.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [menuItem, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('writes a schema file loadCollections can load back, with menu_item/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Restaurant',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'restaurant',
    })

    expect(result.blueprintId).toBe('restaurant')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['menu_item', 'page'])
  })

  it('seeds real demo menu items and pages into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Restaurant',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'restaurant',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const menuItemStore = createContentStore({ db: selection.instance, collection: menuItem })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const items = await menuItemStore.list()
      expect(items.items.length).toBeGreaterThanOrEqual(5)

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(['contact', 'home'])
    } finally {
      await selection.dispose()
    }
  })

  it('resolves /menu/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(RESTAURANT_COLLECTIONS, '/menu/roasted-beet-salad')).toEqual({
      collection: 'menu_item',
      locale: null,
      params: { slug: 'roasted-beet-salad' },
    })
    expect(matchPath(RESTAURANT_COLLECTIONS, '/contact')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'contact' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Restaurant',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'restaurant',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const menuItemStore = createContentStore({ db: selection.instance, collection: menuItem })

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

      const items = await menuItemStore.list()
      const slugById = new Map(items.items.map((entry) => [entry.id, entry.values.slug as string]))
      const themeEntries: readonly ThemeContentEntry[] = items.items.map((entry) => ({
        id: entry.id,
        collection: 'menu_item',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext(slugById)
      const entries: FetchedEntries = { 'demo-home-menu': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('Seasonal, simple, close to home')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Roasted beet salad')
    } finally {
      await selection.dispose()
    }
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'My Restaurant',
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
      const slug = slugById.get(target.id)
      if (slug === undefined) throw new Error(`no slug indexed for entry ${target.id}`)
      return buildPath(menuItem, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
