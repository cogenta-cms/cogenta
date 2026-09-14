import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, createSearchIndex, matchPath } from '@cogenta/schema'
import {
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-restaurant'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildRestaurantDemoPages,
  buildRestaurantHomeBlocks,
  DEFAULT_RESTAURANT_NAME,
  menuItem,
  page,
  RESTAURANT_COLLECTIONS,
  RESTAURANT_DEMO_DISHES,
  RESTAURANT_DISH_PHOTOS,
  RESTAURANT_MEDIA_SPECS,
  RESTAURANT_MENUS,
  RESTAURANT_SITE_SETTINGS,
  restaurantContentPack,
  restaurantDishBlocks,
  restaurantEmail,
} from '../src/blueprints/restaurant.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds nine bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 240_000

const MEDIA = Object.fromEntries(
  RESTAURANT_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]),
)

const NON_TEXT_KEYS = new Set([
  'media',
  'avatar',
  'collection',
  'id',
  'marks',
  'style',
  'listItem',
  'layout',
  'filter',
  'sort',
  'target',
  'ratio',
  'align',
  'link',
  'href',
  'emphasis',
  'provider',
  'url',
  'markDefs',
  'variant',
])

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') || NON_TEXT_KEYS.has(key) ? [] : textsOfValue(inner),
    )
  }
  return []
}

/** One unit of text per paragraph, title, caption and setting: the unit the charter counts in. */
function blockTexts(block: VocabularyBlock): string[] {
  if (block._type === 'prose') return block.body.map((node) => textsOfValue(node).join(''))
  return textsOfValue(block)
}

function allDemoCopy(siteName: string): string[] {
  return [
    ...buildRestaurantDemoPages({ siteName, media: MEDIA }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...RESTAURANT_DEMO_DISHES.flatMap((dish) => [
      dish.name,
      dish.description,
      dish.sourcing,
      dish.pairing ?? '',
      dish.allergens ?? '',
      dish.note,
      ...restaurantDishBlocks(dish).flatMap(blockTexts),
    ]),
    ...RESTAURANT_MEDIA_SPECS.map((spec) => spec.alt),
    ...[...RESTAURANT_MENUS.header, ...RESTAURANT_MENUS.footer].map((item) => item.label),
    String(RESTAURANT_SITE_SETTINGS['general.tagline']),
    String(RESTAURANT_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text !== '')
}

function allTitles(): string[] {
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...buildRestaurantDemoPages({ media: MEDIA }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(titleOf),
    ]),
    ...RESTAURANT_DEMO_DISHES.flatMap((dish) => [
      dish.name,
      ...restaurantDishBlocks(dish).flatMap(titleOf),
    ]),
  ]
}

const SECTIONS = ['Starters', 'Mains', 'Cheese and desserts', 'Wine by the glass']

describe('restaurant blueprint, content model and menu', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [menuItem, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves /menu/:slug and /:slug generically', () => {
    expect(matchPath(RESTAURANT_COLLECTIONS, '/menu/grilled-octopus')).toEqual({
      collection: 'menu_item',
      locale: null,
      params: { slug: 'grilled-octopus' },
    })
    expect(matchPath(RESTAURANT_COLLECTIONS, '/reservations')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'reservations' },
    })
  })

  it('gives a dish the plain fields its page shows: price, section, diet, sourcing, pairing, allergens', () => {
    expect(menuItem.fields.price?.kind).toBe('number')
    expect(menuItem.fields.currency?.kind).toBe('select')
    expect(menuItem.fields.category?.kind).toBe('select')
    expect(menuItem.fields.vegetarian?.kind).toBe('boolean')
    const fields: Readonly<Record<string, { readonly kind: string }>> = menuItem.fields
    for (const name of ['sourcing', 'pairing', 'allergens', 'description']) {
      expect(fields[name]?.kind, name).toBe('text')
    }
    expect(menuItem.fields.photo?.kind).toBe('media')
    expect(menuItem.fields.blocks?.kind).toBe('blocks')
    expect(restaurantContentPack.defaultTheme).toBe('@cogenta/theme-restaurant')
  })

  it('prints a seasonal menu of at least sixteen dishes over four sections, in menu order', () => {
    expect(RESTAURANT_DEMO_DISHES.length).toBeGreaterThanOrEqual(16)
    const slugs = RESTAURANT_DEMO_DISHES.map((dish) => dish.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const order = [...new Set(RESTAURANT_DEMO_DISHES.map((dish) => dish.category))]
    expect(order).toEqual(SECTIONS)
    for (const section of SECTIONS) {
      expect(
        RESTAURANT_DEMO_DISHES.filter((dish) => dish.category === section).length,
        section,
      ).toBeGreaterThanOrEqual(4)
    }
  })

  it('prices every dish in euros within a bistro’s range, and describes it with where it comes from', () => {
    for (const dish of RESTAURANT_DEMO_DISHES) {
      expect(dish.price, dish.slug).toBeGreaterThanOrEqual(5)
      expect(dish.price, dish.slug).toBeLessThanOrEqual(40)
      expect(dish.description.length, dish.slug).toBeGreaterThan(60)
      expect(dish.description.length, dish.slug).toBeLessThanOrEqual(300)
      expect(dish.sourcing.length, dish.slug).toBeGreaterThan(20)
      expect(dish.note.split(/\s+/).length, dish.slug).toBeGreaterThan(18)
    }
  })

  it('lists the allergens of every dish that is not a wine, and marks no wine vegetarian', () => {
    for (const dish of RESTAURANT_DEMO_DISHES) {
      if (dish.category === 'Wine by the glass') {
        expect(dish.vegetarian, dish.slug).toBe(false)
      } else {
        expect(dish.allergens, dish.slug).toBeDefined()
      }
    }
    expect(RESTAURANT_DEMO_DISHES.filter((dish) => dish.vegetarian).length).toBeGreaterThanOrEqual(
      4,
    )
  })

  it('pairs dishes only with wines the menu actually pours', () => {
    const wines = new Set(
      RESTAURANT_DEMO_DISHES.filter((dish) => dish.category === 'Wine by the glass').map(
        (dish) => dish.name,
      ),
    )
    for (const dish of RESTAURANT_DEMO_DISHES) {
      if (dish.pairing !== undefined) expect(wines.has(dish.pairing), dish.slug).toBe(true)
    }
  })

  it('shows every price in one currency, and never names a dollar amount', () => {
    const copy = allDemoCopy(DEFAULT_RESTAURANT_NAME).join('\n')
    expect(copy).not.toMatch(/\$\d|USD|dollar/)
    expect(copy).toMatch(/€\d/)
  })

  it('writes each dish page as valid contract-B blocks: its note, then the rest of its section', () => {
    for (const dish of RESTAURANT_DEMO_DISHES) {
      const blocks = restaurantDishBlocks(dish)
      expect(() => parseBlocks([...blocks]), dish.slug).not.toThrow()
      expect(
        blocks.map((block) => block._type),
        dish.slug,
      ).toEqual(['prose', 'collectionList'])
      expect(blocks[1]).toMatchObject({
        collection: 'menu_item',
        filter: { category: dish.category },
        layout: 'list',
      })
    }
  })
})

describe('restaurant blueprint, photographs', () => {
  it('points every media slot at a bundled JPEG described in a full sentence', () => {
    for (const spec of RESTAURANT_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toMatch(/^restaurant\/[a-z-]+\.jpg$/)
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
      expect(spec.alt.length, spec.name).toBeGreaterThan(30)
      expect(spec.alt, spec.name).not.toMatch(/placeholder|abstract|composition|avatar/i)
    }
  })

  it('bundles no photograph it does not use, and photographs only dishes that exist', async () => {
    const folder = fileURLToPath(
      new URL('../src/blueprints/assets/photos/restaurant/', import.meta.url),
    )
    const files = (await readdir(folder)).sort()
    const used = new Set(
      RESTAURANT_MEDIA_SPECS.map((spec) => (spec.photo as string).slice('restaurant/'.length)),
    )
    expect(files.filter((file) => !used.has(file))).toEqual([])
    const slugs = new Set(RESTAURANT_DEMO_DISHES.map((dish) => dish.slug))
    for (const slug of Object.keys(RESTAURANT_DISH_PHOTOS)) expect(slugs.has(slug), slug).toBe(true)
  })

  it('crops every dish photograph to the same 4:5 portrait', async () => {
    for (const slug of Object.keys(RESTAURANT_DISH_PHOTOS)) {
      const bytes = loadPhotoAsset(`restaurant/${slug}.jpg`) as Uint8Array
      const { width, height } = jpegSize(bytes)
      expect(width / height, slug).toBeCloseTo(0.8, 2)
    }
  })

  it('opens the home page on the room and puts four photographed plates in its band, reusing the dish photographs', () => {
    const blocks = buildRestaurantHomeBlocks({ media: MEDIA })
    const band = blocks.find((block) => block._type === 'gallery')
    expect(band?._type === 'gallery' ? band.layout : undefined).toBe('grid')
    const items = band?._type === 'gallery' ? band.items : []
    expect(items).toHaveLength(4)
    for (const item of items) expect(item.media).toMatch(/^media-dish-/)
    expect(blocks[0]).toMatchObject({ _type: 'hero', media: 'media-hero' })
  })

  it('seeds no logos and no placeholder marks', () => {
    const everything = JSON.stringify([
      ...buildRestaurantDemoPages({ media: MEDIA }).map((demo) => demo.blocks),
      RESTAURANT_MEDIA_SPECS,
    ])
    expect(everything).not.toMatch(/"logoStrip"|"logos"|logo-\d/)
  })

  it('leaves out every picture block, never an empty one, when no media was seeded', () => {
    const pages = buildRestaurantDemoPages({})
    for (const demo of pages) expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
    const blocks = pages.flatMap((demo) => demo.blocks)
    expect(blocks.some((block) => block._type === 'gallery')).toBe(false)
    expect(blocks.some((block) => block._type === 'mediaFigure')).toBe(false)
  })
})

describe('restaurant blueprint, copy', () => {
  it('names the restaurant the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
    const named = allDemoCopy('Maison Verte').join('\n')
    expect(named).toContain('Maison Verte')
    expect(named).toContain('table@maisonverte.fr')
    expect(named).not.toContain(DEFAULT_RESTAURANT_NAME)
    expect(named).not.toMatch(/Amaranthe/)
    expect(allDemoCopy(DEFAULT_RESTAURANT_NAME).join('\n')).toContain(DEFAULT_RESTAURANT_NAME)
    expect(restaurantEmail('Café Rivière', 'events')).toBe('events@caferiviere.fr')
    expect(restaurantEmail(undefined)).toBe('table@laurier.fr')
  })

  it('titles the home page hero with the restaurant’s own name', () => {
    expect(buildRestaurantHomeBlocks({ siteName: 'Maison Verte' })[0]).toMatchObject({
      _type: 'hero',
      title: 'Maison Verte',
    })
    expect(buildRestaurantHomeBlocks()[0]).toMatchObject({ title: DEFAULT_RESTAURANT_NAME })
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const copy = allDemoCopy(DEFAULT_RESTAURANT_NAME).join('\n')
    expect(copy).not.toMatch(
      /cogenta|scaffold|\bdemo\b|editable|lorem|javascript|placeholder|this (theme|template|website)|blueprint/i,
    )
  })

  it('invents its people, suppliers and press rather than borrowing sample names', () => {
    const copy = allDemoCopy(DEFAULT_RESTAURANT_NAME).join('\n')
    expect(copy).not.toMatch(
      /contoso|fabrikam|northwind|acme|globex|initech|lorem|john doe|jane doe|michelin|le monde|gault/i,
    )
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|curated|elevated|timeless|must-have|game-chang|culinary journey|mouth-watering|delectable|exquisite|unforgettable)/i
    for (const text of allDemoCopy(DEFAULT_RESTAURANT_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
      expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
    }
  })

  it('titles no page, block or section as a question; only the questions of an FAQ ask one', () => {
    for (const title of allTitles()) expect(title, title).not.toMatch(/\?/)
  })

  it('quotes the press as a named writer and a publication, never as a star rating', () => {
    const press = buildRestaurantHomeBlocks({ media: MEDIA }).find(
      (block) => block._type === 'quote',
    )
    expect(press).toMatchObject({ author: expect.any(String), role: expect.stringMatching(/2026/) })
    expect(JSON.stringify(press)).not.toMatch(/★|stars?\b|\/5/)
  })
})

describe('restaurant blueprint, pages, reservations and navigation', () => {
  it('seeds valid contract-B pages that use most of the vocabulary', () => {
    const types = new Set<string>()
    for (const demo of buildRestaurantDemoPages({ media: MEDIA })) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) types.add(block._type)
    }
    expect(types.size).toBeGreaterThanOrEqual(11)
    expect(buildRestaurantDemoPages().map((demo) => demo.slug)).toEqual([
      'home',
      'menu',
      'our-story',
      'reservations',
      'private-dining',
      'visit',
      'legal',
    ])
  })

  it('opens the home page on the room with one quiet action, then the welcome, then the menu', () => {
    const blocks = buildRestaurantHomeBlocks({ siteName: 'Maison Verte', media: MEDIA })
    const [hero, welcome, menu] = blocks
    expect(hero && 'actions' in hero ? hero.actions : []).toEqual([
      { label: 'Reserve a table', target: { href: '/reservations' } },
    ])
    expect(welcome).toMatchObject({ _type: 'prose', variant: { align: 'center' } })
    expect(menu).toMatchObject({
      _type: 'collectionList',
      collection: 'menu_item',
      layout: 'grid',
    })
    const types = blocks.map((block) => block._type)
    for (const type of ['gallery', 'quote', 'featureGrid', 'cta']) expect(types).toContain(type)
  })

  it('makes booking honest: a telephone link, an email link and a page that explains the rest', () => {
    const reservations = buildRestaurantDemoPages({ siteName: 'Maison Verte' }).find(
      (demo) => demo.slug === 'reservations',
    )
    const json = JSON.stringify(reservations?.blocks)
    expect(json).toContain('tel:+33478281642')
    expect(json).toContain('mailto:table@maisonverte.fr')
    expect(json).toMatch(/Deposits/)
    expect(json).toMatch(/cancel/i)
    expect(json).toMatch(/counter/)
    const everything = JSON.stringify(buildRestaurantDemoPages({ media: MEDIA }))
    expect(everything).not.toMatch(/book online|booking widget|opentable|resy|thefork/i)
    expect(RESTAURANT_MENUS.headerAction).toEqual({ label: 'Reserve', url: '/reservations' })
  })

  it('sorts every list on a field contract B allows, and prints the menu in the order it was written', () => {
    const lists = [
      ...buildRestaurantDemoPages({ media: MEDIA }).flatMap((demo) => demo.blocks),
      ...RESTAURANT_DEMO_DISHES.flatMap(restaurantDishBlocks),
    ].filter((block) => block._type === 'collectionList')
    expect(lists.length).toBeGreaterThan(16)
    for (const block of lists) {
      if (block._type !== 'collectionList') continue
      expect(block.sort).toEqual({ field: 'id', direction: 'asc' })
      expect(block.limit ?? 0).toBeGreaterThanOrEqual(RESTAURANT_DEMO_DISHES.length)
    }
  })

  it('links every menu item and every in-page link to a page or a dish the blueprint seeds', () => {
    const routes = new Set([
      ...buildRestaurantDemoPages().map((demo) => `/${demo.slug}`),
      ...RESTAURANT_DEMO_DISHES.map((dish) => `/menu/${dish.slug}`),
    ])
    for (const item of [
      ...RESTAURANT_MENUS.header,
      ...RESTAURANT_MENUS.footer,
      RESTAURANT_MENUS.headerAction,
    ]) {
      expect(routes.has(item?.url ?? ''), item?.url).toBe(true)
    }
    const hrefs = JSON.stringify(
      buildRestaurantDemoPages({ media: MEDIA }).map((demo) => demo.blocks),
    ).match(/"href":"[^"]+"/g)
    expect(hrefs?.length).toBeGreaterThan(8)
    for (const match of hrefs ?? []) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(routes.has(href), href).toBe(true)
    }
  })

  it('closes comments on the menu, and carries an address card a real restaurant would print', () => {
    expect(RESTAURANT_SITE_SETTINGS['discussion.enabled']).toBe(false)
    const note = String(RESTAURANT_SITE_SETTINGS['general.footerNote'])
    expect(note).toMatch(/8 rue Burdeau\n69001 Lyon\n\+33 4 78 28 16 42/)
    expect(note).toMatch(/Dinner Tuesday to Saturday/)
    expect(note).not.toMatch(/create-cogenta|scaffold|demo/i)
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-restaurant/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.restaurant).toEqual(theme)
    expect(STARTING_SKINS.restaurant?.font.serif.startsWith("'Cormorant Garamond'")).toBe(true)
    expect(STARTING_SKINS.restaurant?.font.sans.startsWith("'Karla'")).toBe(true)
    expect(STARTING_SKINS.restaurant?.color.accent).toBe('#7b5b1f')
  })
})

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

/** Width and height from a JPEG's first start-of-frame marker. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2
  while (offset < bytes.length) {
    const marker = bytes[offset + 1] as number
    const length = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number)
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: ((bytes[offset + 5] as number) << 8) | (bytes[offset + 6] as number),
        width: ((bytes[offset + 7] as number) << 8) | (bytes[offset + 8] as number),
      }
    }
    offset += 2 + length
  }
  throw new Error('no start-of-frame marker in the JPEG')
}

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
