import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'
import {
  buildStoreDemoPages,
  buildStoreHomeBlocks,
  category,
  DEFAULT_SHOP_NAME,
  orderLinkFor,
  page,
  product,
  STORE_COLLECTIONS,
  STORE_DEMO_CATEGORIES,
  STORE_DEMO_PRODUCTS,
  STORE_MEDIA_SPECS,
  STORE_MENUS,
  STORE_SITE_SETTINGS,
  shopEmail,
  storeCategoryBlocks,
  storeContentPack,
  storeProductBlocks,
} from '../src/blueprints/store.js'

const MEDIA = Object.fromEntries(STORE_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]))

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
    ...buildStoreDemoPages({ siteName, media: MEDIA }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...STORE_DEMO_PRODUCTS.flatMap((demo) => [
      demo.name,
      demo.description,
      demo.material,
      demo.dimensions,
      demo.weight ?? '',
      demo.capacity ?? '',
      demo.origin,
      demo.care,
      demo.delivery,
      ...storeProductBlocks(demo).flatMap(blockTexts),
    ]),
    ...STORE_DEMO_CATEGORIES.flatMap((demo) => [
      demo.name,
      demo.summary,
      ...storeCategoryBlocks(demo).flatMap(blockTexts),
    ]),
    ...STORE_MEDIA_SPECS.map((spec) => spec.alt),
    ...[...STORE_MENUS.header, ...STORE_MENUS.footer].map((item) => item.label),
    String(STORE_SITE_SETTINGS['general.tagline']),
    String(STORE_SITE_SETTINGS['general.footerNote']),
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
    ...buildStoreDemoPages({ media: MEDIA }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(titleOf),
    ]),
    ...STORE_DEMO_PRODUCTS.flatMap((demo) => [
      demo.name,
      ...storeProductBlocks(demo).flatMap(titleOf),
    ]),
    ...STORE_DEMO_CATEGORIES.flatMap((demo) => storeCategoryBlocks(demo).flatMap(titleOf)),
  ]
}

const HOME_GRID = STORE_DEMO_PRODUCTS.slice(-4).map((demo) => demo.slug)

describe('store blueprint, content model and catalogue', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [product, category, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves /shop/:slug, /category/:slug and /:slug generically', () => {
    expect(matchPath(STORE_COLLECTIONS, '/shop/field-jacket')).toEqual({
      collection: 'product',
      locale: null,
      params: { slug: 'field-jacket' },
    })
    expect(matchPath(STORE_COLLECTIONS, '/category/wear')).toEqual({
      collection: 'category',
      locale: null,
      params: { slug: 'wear' },
    })
    expect(matchPath(STORE_COLLECTIONS, '/repairs')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'repairs' },
    })
  })

  it('gives a product the plain fields its page shows: price, currency, stock, details and where to order', () => {
    expect(product.fields.price?.kind).toBe('number')
    expect(product.fields.currency?.kind).toBe('select')
    expect(product.fields.category?.kind).toBe('select')
    expect(product.fields.inStock?.kind).toBe('boolean')
    const fields: Readonly<Record<string, { readonly kind: string }>> = product.fields
    for (const name of [
      'material',
      'dimensions',
      'weight',
      'capacity',
      'origin',
      'care',
      'delivery',
      'orderLink',
    ]) {
      expect(fields[name]?.kind, name).toBe('text')
    }
    expect(product.fields.blocks?.kind).toBe('blocks')
    expect(storeContentPack.defaultTheme).toBe('@cogenta/theme-ecommerce')
  })

  it('sells at least twelve products, at least two per category, two of them sold out', () => {
    expect(STORE_DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(12)
    const slugs = STORE_DEMO_PRODUCTS.map((demo) => demo.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const group of STORE_DEMO_CATEGORIES) {
      expect(
        STORE_DEMO_PRODUCTS.filter((demo) => demo.category === group.name).length,
        group.name,
      ).toBeGreaterThanOrEqual(2)
    }
    expect(STORE_DEMO_PRODUCTS.filter((demo) => !demo.inStock)).toHaveLength(2)
  })

  it('prices every product in whole euros, and describes it with its material, size, origin and care', () => {
    for (const demo of STORE_DEMO_PRODUCTS) {
      expect(Number.isInteger(demo.price) && demo.price > 0, demo.slug).toBe(true)
      expect(demo.description.length, demo.slug).toBeLessThanOrEqual(300)
      expect(demo.description.length, demo.slug).toBeGreaterThan(80)
      for (const detail of [
        demo.material,
        demo.dimensions,
        demo.origin,
        demo.care,
        demo.delivery,
      ]) {
        expect(detail.length, demo.slug).toBeGreaterThan(4)
      }
      expect(demo.story.join(' ').split(/\s+/).length, demo.slug).toBeGreaterThan(60)
    }
  })

  it('shows every price in one currency, and never names a dollar amount', () => {
    const copy = allDemoCopy(DEFAULT_SHOP_NAME).join('\n')
    expect(copy).not.toMatch(/\$\d|USD|dollar/)
    expect(copy).toMatch(/€\d/)
  })

  it('orders each product by email to the shop, with the product in the subject line', () => {
    expect(orderLinkFor('Casa Norte', 'Field jacket')).toBe(
      'mailto:orders@casanorte.com?subject=Order%3A%20Field%20jacket',
    )
    expect(orderLinkFor(undefined, 'Enamel mug')).toBe(
      'mailto:orders@ateliergoods.com?subject=Order%3A%20Enamel%20mug',
    )
  })

  it('writes every product page and category page as valid contract-B blocks, with more from the same category', () => {
    for (const demo of STORE_DEMO_PRODUCTS) {
      const blocks = storeProductBlocks(demo)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      expect(
        blocks.map((block) => block._type),
        demo.slug,
      ).toEqual(['prose', 'collectionList'])
      expect(blocks[1]).toMatchObject({
        collection: 'product',
        filter: { category: demo.category },
      })
    }
    for (const demo of STORE_DEMO_CATEGORIES) {
      const blocks = storeCategoryBlocks(demo)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      expect(blocks[0]).toMatchObject({ _type: 'collectionList', filter: { category: demo.name } })
    }
  })

  it('points every media slot at a bundled JPEG described in a full sentence', () => {
    for (const spec of STORE_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toMatch(/^store\/[a-z-]+\.jpg$/)
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
      expect(spec.alt.length, spec.name).toBeGreaterThan(30)
      expect(spec.alt, spec.name).not.toMatch(/placeholder|abstract|mark \d|avatar/i)
    }
  })

  it('bundles no photograph it does not use, and uses every product photograph once for its product', async () => {
    const folder = fileURLToPath(new URL('../src/blueprints/assets/photos/store/', import.meta.url))
    const files = (await readdir(folder)).sort()
    const used = new Set(
      STORE_MEDIA_SPECS.map((spec) => (spec.photo as string).slice('store/'.length)),
    )
    expect(files.filter((file) => !used.has(file))).toEqual([])
    for (const demo of STORE_DEMO_PRODUCTS) {
      expect(STORE_MEDIA_SPECS.some((spec) => spec.photo === `store/${demo.slug}.jpg`)).toBe(true)
    }
  })

  it('pictures each category with a product not already on the home page’s grid', () => {
    for (const demo of STORE_DEMO_CATEGORIES) {
      expect(HOME_GRID, demo.slug).not.toContain(demo.photoOf)
      const owner = STORE_DEMO_PRODUCTS.find((candidate) => candidate.slug === demo.photoOf)
      expect(owner?.category, demo.slug).toBe(demo.name)
    }
  })

  it('names the shop the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
    const named = allDemoCopy('Casa Norte').join('\n')
    expect(named).toContain('Casa Norte')
    expect(named).toContain('orders@casanorte.com')
    expect(named).not.toContain(DEFAULT_SHOP_NAME)
    expect(named).not.toContain('ateliergoods')
    expect(allDemoCopy(DEFAULT_SHOP_NAME).join('\n')).toContain(DEFAULT_SHOP_NAME)
    expect(shopEmail('Café Ribeira', 'repairs')).toBe('repairs@caferibeira.com')
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const copy = allDemoCopy(DEFAULT_SHOP_NAME).join('\n')
    expect(copy).not.toMatch(
      /cogenta|scaffold|\bdemo\b|editable|lorem|javascript|placeholder|this (theme|template|website)|blueprint/i,
    )
  })

  it('invents its people and workshops rather than borrowing sample-company names', () => {
    const copy = allDemoCopy(DEFAULT_SHOP_NAME).join('\n')
    expect(copy).not.toMatch(
      /contoso|fabrikam|northwind|acme|globex|initech|umbrella corp|lorem|john doe|jane doe/i,
    )
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|curated|elevated|timeless|must-have|game-chang)/i
    for (const text of allDemoCopy(DEFAULT_SHOP_NAME)) {
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

  it('opens the home page on a banner with one action, then the categories, then the new season', () => {
    const blocks = buildStoreHomeBlocks({ siteName: 'Casa Norte', media: MEDIA })
    expect(() => parseBlocks([...blocks])).not.toThrow()
    const [banner, categories, season] = blocks
    expect(banner).toMatchObject({ _type: 'hero', media: 'media-hero' })
    expect(banner && 'actions' in banner ? banner.actions : []).toHaveLength(1)
    expect(categories).toMatchObject({
      _type: 'collectionList',
      collection: 'category',
      layout: 'grid',
    })
    expect(season).toMatchObject({ _type: 'collectionList', collection: 'product', limit: 4 })
    const types = blocks.map((block) => block._type)
    expect(types).toContain('featureGrid')
    expect(types).toContain('mediaFigure')
    expect(types).toContain('testimonial')
    expect(types).toContain('faq')
    expect(JSON.stringify(blocks.at(-1))).toContain('mailto:letters@casanorte.com')
    expect(JSON.stringify(blocks)).toContain('Casa Norte opened in 2014')
  })

  it('sets its commitments as statements without a sentence, so the theme draws them as one ruled line', () => {
    const line = buildStoreHomeBlocks().find((block) => block._type === 'featureGrid')
    expect(line).toBeDefined()
    if (line?._type !== 'featureGrid') return
    expect(line.items.every((item) => item.text === undefined && item.icon === undefined)).toBe(
      true,
    )
  })

  it('designs its customer letter without a portrait', () => {
    const letter = buildStoreHomeBlocks({ media: MEDIA }).find(
      (block) => block._type === 'testimonial',
    )
    expect(letter?._type === 'testimonial' ? letter.attribution.avatar : 'missing').toBeUndefined()
  })

  it('seeds no logos and no placeholder marks', () => {
    const everything = JSON.stringify([
      ...buildStoreDemoPages({ media: MEDIA }).map((demo) => demo.blocks),
      STORE_MEDIA_SPECS,
    ])
    expect(everything).not.toMatch(/"logoStrip"|"logos"|logo-\d/)
  })

  it('sorts every list on a field contract B allows', () => {
    const lists = [
      ...buildStoreDemoPages({ media: MEDIA }).flatMap((demo) => demo.blocks),
      ...STORE_DEMO_PRODUCTS.flatMap(storeProductBlocks),
      ...STORE_DEMO_CATEGORIES.flatMap(storeCategoryBlocks),
    ].filter((block) => block._type === 'collectionList')
    expect(lists.length).toBeGreaterThan(10)
    for (const block of lists) {
      if (block._type !== 'collectionList') continue
      expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
    }
  })

  it('seeds valid contract-B pages that use most of the vocabulary', () => {
    const types = new Set<string>()
    for (const demo of buildStoreDemoPages({ media: MEDIA })) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) types.add(block._type)
    }
    expect(types.size).toBeGreaterThanOrEqual(10)
    expect(buildStoreDemoPages().map((demo) => demo.slug)).toEqual([
      'home',
      'shop',
      'about',
      'how-to-order',
      'delivery-and-returns',
      'repairs',
      'contact',
      'terms',
    ])
  })

  it('links every menu item and every in-page link to a page, a category or a product the blueprint seeds', () => {
    const routes = new Set([
      ...buildStoreDemoPages().map((demo) => `/${demo.slug}`),
      ...STORE_DEMO_CATEGORIES.map((demo) => `/category/${demo.slug}`),
      ...STORE_DEMO_PRODUCTS.map((demo) => `/shop/${demo.slug}`),
    ])
    for (const item of [...STORE_MENUS.header, ...STORE_MENUS.footer, STORE_MENUS.headerAction]) {
      expect(routes.has(item?.url ?? ''), item?.url).toBe(true)
    }
    const hrefs = JSON.stringify(
      buildStoreDemoPages({ media: MEDIA }).map((demo) => demo.blocks),
    ).match(/"href":"[^"]+"/g)
    expect(hrefs?.length).toBeGreaterThan(5)
    for (const match of hrefs ?? []) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(routes.has(href), href).toBe(true)
    }
  })

  it('closes comments on the catalogue, and carries a footer note a real company would write', () => {
    expect(STORE_SITE_SETTINGS['discussion.enabled']).toBe(false)
    const note = String(STORE_SITE_SETTINGS['general.footerNote'])
    expect(note).toMatch(/Rua da Boavista 84/)
    expect(note).toMatch(/NIPC/)
    expect(note).not.toMatch(/create-cogenta|scaffold|demo/i)
  })

  it("matches the theme's own palette and typeface in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-ecommerce/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.store).toEqual(theme)
    expect(STARTING_SKINS.store?.font.sans.startsWith("'Albert Sans'")).toBe(true)
    expect(STARTING_SKINS.store?.color.accent).toBe('#9a4a2e')
  })
})
