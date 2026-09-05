import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, createThemeStore, matchPath } from '@cogenta/schema'
import {
  type FetchedEntries,
  type HtmlNode,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-restaurant'
import { afterEach, describe, expect, it } from 'vitest'
import {
  menuItem,
  page,
  RESTAURANT_COLLECTIONS,
  RESTAURANT_MEDIA_SPECS,
} from '../src/blueprints/restaurant.js'
import { scaffoldSite } from '../src/scaffold.js'

// `restaurant` renders and ingests 20 real demo images (hero, twelve dish
// photos, six gallery shots, one avatar) through the real media pipeline
// during `scaffoldSite` — genuinely slower than the default 5s, not a hang
// (see `starting-skins.test.ts`'s own note on `store`'s narrower case).
const SCAFFOLD_TIMEOUT = 120_000

describe('scaffoldSite — restaurant blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [menuItem, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('declares a photo field on menu_item, for entryImage to render a dish photo', () => {
    expect(menuItem.fields.photo).toBeDefined()
  })

  it('names @cogenta/theme-restaurant as its default theme', async () => {
    const { restaurantContentPack } = await import('../src/blueprints/restaurant.js')
    expect(restaurantContentPack.defaultTheme).toBe('@cogenta/theme-restaurant')
  })

  it('seeds twelve dishes across four categories', async () => {
    const { RESTAURANT_DEMO_MENU_ITEMS } = await import('../src/blueprints/restaurant.js')
    expect(RESTAURANT_DEMO_MENU_ITEMS).toHaveLength(12)
    const categories = new Set(RESTAURANT_DEMO_MENU_ITEMS.map((item) => item.category))
    expect(categories).toEqual(new Set(['Starters', 'Mains', 'Desserts', 'Drinks']))
  })

  it('seeds one media spec per dish, plus the hero, six gallery shots and an avatar', () => {
    const names = RESTAURANT_MEDIA_SPECS.map((spec) => spec.name)
    expect(names).toContain('hero')
    expect(names).toContain('avatar')
    expect(names.filter((name) => name.startsWith('dish-'))).toHaveLength(12)
    expect(names.filter((name) => name.startsWith('gallery-'))).toHaveLength(6)
  })

  it(
    'writes a schema file loadCollections can load back, with menu_item/page',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'Amaranthe',
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
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'activates @cogenta/theme-restaurant on the scaffolded site',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'Amaranthe',
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
        const state = await createThemeStore({ db: selection.instance }).get()
        expect(state.activeTheme).toBe('@cogenta/theme-restaurant')
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'seeds real demo menu items and pages into real SQLite, with cover photos',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'Amaranthe',
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
        expect(items.items).toHaveLength(12)
        expect(items.items.every((entry) => entry.status === 'published')).toBe(true)
        const withPhoto = items.items.filter((entry) => typeof entry.values.photo === 'string')
        expect(withPhoto.length).toBe(12)

        const pages = await pageStore.list()
        expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(['home', 'privacy'])
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

  it('resolves /menu/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(RESTAURANT_COLLECTIONS, '/menu/roasted-beet-salad')).toEqual({
      collection: 'menu_item',
      locale: null,
      params: { slug: 'roasted-beet-salad' },
    })
    expect(matchPath(RESTAURANT_COLLECTIONS, '/privacy')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'privacy' },
    })
  })

  it(
    'renders the seeded home page into real HTML through the real theme-restaurant pipeline',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'Amaranthe',
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
        const slugById = new Map(
          items.items.map((entry) => [entry.id, entry.values.slug as string]),
        )
        const themeEntries: readonly ThemeContentEntry[] = items.items.map((entry) => ({
          id: entry.id,
          collection: 'menu_item',
          locale: entry.locale,
          status: entry.status,
          ...entry.values,
        }))

        const ctx = fakeThemeContext(slugById)
        const entries: FetchedEntries = { 'home-menu': themeEntries }

        const html = htmlOf(renderPage(pageContent, ctx, entries))

        expect(html).toContain('Amaranthe')
        expect(html).toContain('id="home-menu"')
        expect(html).toContain('Roasted beet salad')
        expect(html).toContain('Starters')
        expect(html).toContain('Mains')
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'Amaranthe',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1600,
      height: 1000,
      alt: 'restaurant demo image',
      focal: null,
    }),
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
