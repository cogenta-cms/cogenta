import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, createSearchIndex } from '@cogenta/schema'
import {
  buildStoreDemoPages,
  orderLinkFor,
  storeCopyFor,
  storeMediaSpecs,
  storeMenus,
  storeSchema,
} from '@cogenta/starters/blueprints/store'
import {
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds seventeen bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 240_000

// Installed in both languages: the schema, the addresses and every word of
// content follow the site's language.
const SAID = {
  en: {
    hero: 'Things for every day, made to last and to be mended',
    newest: 'Leather boots',
    story: 'Casa Norte opened in 2014',
    searched: 'skillet',
    categorySlugs: ['homeware', 'kitchen', 'wear-and-carry'],
    firstProduct: 'Enamel mug',
  },
  fr: {
    hero: 'Des objets pour tous les jours, faits pour durer et pour être réparés',
    newest: 'Bottines en cuir',
    story: 'Casa Norte a ouvert en 2014',
    searched: 'poêle',
    categorySlugs: ['a-porter', 'cuisine', 'maison'],
    firstProduct: 'Mug émaillé',
  },
} as const

describe.each(['en', 'fr'] as const)('scaffoldSite, store blueprint in %s', (locale) => {
  const copy = storeCopyFor(locale)
  const model = storeSchema(copy)
  const { category, page, product } = model
  const said = SAID[locale]
  const HOME_GRID = copy.products.slice(-4).map((demo) => demo.slug)

  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-store-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Casa Norte',
      siteUrl: 'http://localhost:4000',
      defaultLocale: locale,
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'store',
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

  it('writes a schema file loadCollections can load back, with category, page and product', async () => {
    expect(result.blueprintId).toBe('store')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['category', 'page', 'product'])
  })

  it('activates @cogenta/theme-ecommerce with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-ecommerce')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#9a4a2e')
    expect(tokens.font.sans).toContain('Albert Sans')
  })

  it('seeds the menus, the settings and every bundled photograph', () => {
    expect(result.menusSeeded).toBe(
      storeMenus(copy).header.length +
        storeMenus(copy).footer.length +
        (storeMenus(copy).headerAction ? 1 : 0),
    )
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(4)
    expect(result.mediaSeeded).toBe(storeMediaSpecs(copy).length)
  })

  it('seeds published products with their photograph, details and an order link naming the shop', async () => {
    await withDatabase(async (db) => {
      const products = await createContentStore({ db, collection: product }).list({ limit: 100 })
      expect(products.items).toHaveLength(copy.products.length)
      for (const entry of products.items) {
        const demo = copy.products.find((candidate) => candidate.slug === entry.values.slug)
        expect(demo, String(entry.values.slug)).toBeDefined()
        expect(entry.status).toBe('published')
        expect(entry.values.price).toBe(demo?.price)
        expect(entry.values.currency).toBe('EUR')
        expect(entry.values.inStock).toBe(demo?.inStock)
        expect(entry.values.material).toBe(demo?.material)
        expect(entry.values.category).toBe(
          copy.categories.find((group) => group.id === demo?.category)?.name,
        )
        expect(typeof entry.values.photo).toBe('string')
        expect(entry.values.orderLink).toBe(orderLinkFor('Casa Norte', demo?.name ?? '', locale))
        expect(entry.blocks.blocks?.map((block) => block.type)).toEqual(['prose', 'collectionList'])
      }
    })
  })

  it('lists the goods newest first through the sort the home grid uses', async () => {
    await withDatabase(async (db) => {
      const listed = await createContentStore({ db, collection: product }).list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 4,
      })
      expect(listed.items.map((entry) => entry.values.slug)).toEqual([...HOME_GRID].reverse())
    })
  })

  it('seeds the three categories with their photograph, and every page, all published', async () => {
    await withDatabase(async (db) => {
      const categories = await createContentStore({ db, collection: category }).list()
      expect(categories.items.map((entry) => entry.values.slug).sort()).toEqual(
        [...said.categorySlugs].sort(),
      )
      expect(categories.items.every((entry) => typeof entry.values.photo === 'string')).toBe(true)
      const pages = await createContentStore({ db, collection: page }).list({ limit: 20 })
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(
        buildStoreDemoPages({ locale })
          .map((demo) => demo.slug)
          .sort(),
      )
      expect(
        [...categories.items, ...pages.items].every((entry) => entry.status === 'published'),
      ).toBe(true)
    })
  })

  it('indexes the seeded products for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: said.searched, locale })
      expect(results.hits.some((hit) => hit.collection === 'product')).toBe(true)
    })
  })

  // Rendered through `@cogenta/theme-canonical`, the theme this package
  // already depends on: what is checked here is that the seeded page and the
  // seeded products make a real page together. The store theme's own markup
  // is covered by its own package and by the capture bench.
  it('renders the seeded home page into real HTML, naming the shop and its newest goods', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const productStore = createContentStore({ db, collection: product })
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
      const listed = await productStore.list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 4,
      })
      const themeEntries: readonly ThemeContentEntry[] = listed.items.map((entry) => ({
        id: entry.id,
        collection: 'product',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const slugById = new Map(listed.items.map((entry) => [entry.id, entry.values.slug as string]))
      const entries: FetchedEntries = { 'home-new': themeEntries }

      const html = serialize(
        renderPage(
          { title: home.values.title as string, blocks },
          themeContext(slugById, locale),
          entries,
        ),
      )
      expect(html).toContain(said.hero)
      expect(html).toContain(said.newest)
      expect(html).toContain(said.story)
      expect(html).toContain('mailto:letters@casanorte.com')
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    })
  })
})

function themeContext(slugById: ReadonlyMap<string, string>, locale: 'en' | 'fr'): RenderContext {
  const { product } = storeSchema(storeCopyFor(locale))
  return {
    site: {
      name: 'Casa Norte',
      url: 'http://localhost:4000',
      locales: [locale],
      defaultLocale: locale,
    },
    locale,
    url: new URL('http://localhost:4000/'),
    t: (key) => key,
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1200,
      height: 1200,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) return '#'
      return buildPath(product, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
