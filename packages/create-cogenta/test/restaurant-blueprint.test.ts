import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, createSearchIndex } from '@cogenta/schema'
import {
  buildRestaurantDemoPages,
  menuItem,
  page,
  RESTAURANT_DEMO_DISHES,
  RESTAURANT_DISH_PHOTOS,
  RESTAURANT_MEDIA_SPECS,
  RESTAURANT_MENUS,
} from '@cogenta/starters/blueprints/restaurant'
import {
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-restaurant'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds nine bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 240_000

describe('scaffoldSite, restaurant blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-restaurant-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Maison Verte',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'restaurant',
    })
  }, SCAFFOLD_TIMEOUT)

  afterAll(async () => {
    if (targetDir !== '') await rm(targetDir, { recursive: true, force: true })
  })

  async function withDatabase<T>(
    use: (db: Parameters<typeof createContentStore>[0]['db']) => Promise<T>,
  ): Promise<T> {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      return await use(selection.instance)
    } finally {
      await selection.dispose()
    }
  }

  it('writes a schema file loadCollections can load back, with menu_item and page', async () => {
    expect(result.blueprintId).toBe('restaurant')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['menu_item', 'page'])
  })

  it('activates @cogenta/theme-restaurant with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-restaurant')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#7b5b1f')
    expect(tokens.font.serif).toContain('Cormorant Garamond')
    expect(tokens.font.sans).toContain('Karla')
  })

  it('seeds the menus, the settings and every bundled photograph', () => {
    expect(result.menusSeeded).toBe(
      RESTAURANT_MENUS.header.length +
        RESTAURANT_MENUS.footer.length +
        (RESTAURANT_MENUS.headerAction ? 1 : 0),
    )
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(4)
    expect(result.mediaSeeded).toBe(RESTAURANT_MEDIA_SPECS.length)
  })

  it('seeds every dish published, with its price, section, details and photograph when it has one', async () => {
    await withDatabase(async (db) => {
      const dishes = await createContentStore({ db, collection: menuItem }).list({ limit: 100 })
      expect(dishes.items).toHaveLength(RESTAURANT_DEMO_DISHES.length)
      for (const entry of dishes.items) {
        const dish = RESTAURANT_DEMO_DISHES.find(
          (candidate) => candidate.slug === entry.values.slug,
        )
        expect(dish, String(entry.values.slug)).toBeDefined()
        expect(entry.status).toBe('published')
        expect(entry.values.price).toBe(dish?.price)
        expect(entry.values.currency).toBe('EUR')
        expect(entry.values.category).toBe(dish?.category)
        expect(entry.values.vegetarian).toBe(dish?.vegetarian)
        expect(entry.values.sourcing).toBe(dish?.sourcing)
        expect(typeof entry.values.photo === 'string').toBe(
          (dish?.slug ?? '') in RESTAURANT_DISH_PHOTOS,
        )
        expect(entry.blocks.blocks?.map((block) => block.type)).toEqual(['prose', 'collectionList'])
      }
    })
  })

  it('lists the dishes in menu order through the sort the menu uses', async () => {
    await withDatabase(async (db) => {
      const listed = await createContentStore({ db, collection: menuItem }).list({
        sort: { field: 'id', direction: 'asc' },
        limit: 100,
      })
      expect(listed.items.map((entry) => entry.values.slug)).toEqual(
        RESTAURANT_DEMO_DISHES.map((dish) => dish.slug),
      )
    })
  })

  it('seeds every page, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list({ limit: 20 })
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(
        buildRestaurantDemoPages()
          .map((demo) => demo.slug)
          .sort(),
      )
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('indexes the seeded dishes for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: 'octopus', locale: 'en' })
      expect(results.hits.some((hit) => hit.collection === 'menu_item')).toBe(true)
    })
  })

  it('renders the seeded home page through the restaurant theme: the name, the menu grouped with its prices', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const dishStore = createContentStore({ db, collection: menuItem })
      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      if (home === undefined) throw new Error('the home page was not seeded')
      const blocks = (home.blocks.blocks ?? []).map(
        (block): VocabularyBlock =>
          ({
            _key: block.key,
            _type: block.type,
            _version: '1.0.0',
            ...block.data,
          }) as VocabularyBlock,
      )
      const listed = await dishStore.list({ sort: { field: 'id', direction: 'asc' }, limit: 100 })
      const themeEntries: readonly ThemeContentEntry[] = listed.items.map((entry) => ({
        id: entry.id,
        collection: 'menu_item',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const slugById = new Map(listed.items.map((entry) => [entry.id, entry.values.slug as string]))
      const entries: FetchedEntries = { 'home-menu': themeEntries }

      const html = serialize(
        renderPage({ title: home.values.title as string, blocks }, themeContext(slugById), entries),
      )
      expect(html).toContain('<h1 class="cr-hero__title" data-field="title">Maison Verte</h1>')
      expect(html).toContain('<h3 class="cr-menu__section-title">Starters</h3>')
      expect(html).toContain('<h3 class="cr-menu__section-title">Wine by the glass</h3>')
      expect(html).toContain('href="/menu/grilled-octopus">Grilled octopus, saffron and orange</a>')
      expect(html).toContain('<data class="cr-menu__price" value="17">€17</data>')
      expect(html).toContain('data-variant-align="center"')
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(html).not.toContain('Amaranthe')
    })
  })
})

function themeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'Maison Verte',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/'),
    t: (key) => key,
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1344,
      height: 768,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) return '#'
      return buildPath(menuItem, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
