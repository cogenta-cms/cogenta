import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { validateWidgetSettings, validateWidgetVisibility } from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
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
  shopEmail,
  storeCategoryBlocks,
  storeContentPack,
  storeCopyFor,
  storeMediaSpecs,
  storeMenus,
  storeProductBlocks,
  storeSchema,
  storeSiteSettings,
  storeWidgets,
} from '../src/blueprints/store.js'
import type { StoreCopy } from '../src/blueprints/store-copy.js'
import { STORE_PHOTO_CREDITS } from '../src/blueprints/store-credits.js'

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

const LOCALES = ['en', 'fr'] as const

/** What each language says on its own pages, so a test proves the pack is written in that language. */
const SENTINELS = {
  en: {
    heroTitle: 'Things for every day, made to last and to be mended',
    shopSlug: 'shop',
    productRoute: '/shop/cast-iron-skillet',
    categoryRoute: '/category/kitchen',
    pageRoute: '/repairs',
    firstProduct: 'Enamel mug',
    storyBy: 'opened in 2014',
    care: 'We reply within one working day, Tuesday to Saturday',
    letters: 'letters from the workshop, four a year',
    phone: '+33 4 65 71 42 17',
    euro: /€\d/,
    schemaLabel: 'Product',
    otherLanguage: /\b(des|une|avec|pour|dans|nous|vous|livraison)\b/i,
    slugs: [
      'home',
      'shop',
      'about',
      'how-to-order',
      'delivery-and-returns',
      'repairs',
      'contact',
      'terms',
      'photo-credits',
    ],
    footerPrinted: /rue Imbert-Colomès|11:00|19:00|RCS/,
    categorySlugs: ['homeware', 'kitchen', 'wear-and-carry'],
    subject: 'Order%3A%20Field',
  },
  fr: {
    heroTitle: 'Des objets pour tous les jours, faits pour durer et pour être réparés',
    shopSlug: 'boutique',
    productRoute: '/boutique/poele-en-fonte',
    categoryRoute: '/categorie/cuisine',
    pageRoute: '/reparations',
    firstProduct: 'Mug émaillé',
    storyBy: 'a ouvert en 2014',
    care: 'Nous répondons sous un jour ouvré, du mardi au samedi',
    letters: 'lettres de l’atelier, quatre par an',
    phone: '04\u00a065\u00a071\u00a042\u00a017',
    euro: /\d\s?€/,
    schemaLabel: 'Produit',
    otherLanguage: /\b(the|and|with|for|your|delivery)\b/i,
    slugs: [
      'home',
      'boutique',
      'a-propos',
      'commander',
      'livraison-et-retours',
      'reparations',
      'contact',
      'conditions',
      'credits-photos',
    ],
    footerPrinted: /rue Imbert-Colomès|11\s?h|19\s?h|RCS/,
    categorySlugs: ['maison', 'cuisine', 'a-porter'],
    subject: 'Commande%C2%A0%3A%20Field',
  },
} as const

function allDemoCopy(copy: StoreCopy, siteName: string): string[] {
  const locale = copy.locale
  const media = Object.fromEntries(
    storeMediaSpecs(copy).map((spec) => [spec.name, `media-${spec.name}`]),
  )
  return [
    ...buildStoreDemoPages({ siteName, media, locale }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...copy.products.flatMap((demo) => [
      demo.name,
      demo.description,
      demo.material,
      demo.dimensions,
      demo.weight ?? '',
      demo.capacity ?? '',
      demo.origin,
      demo.care,
      demo.delivery,
      ...storeProductBlocks(copy, demo).flatMap(blockTexts),
    ]),
    ...copy.categories.flatMap((demo) => [
      demo.name,
      demo.summary,
      ...storeCategoryBlocks(demo).flatMap(blockTexts),
    ]),
    ...storeMediaSpecs(copy).map((spec) => spec.alt),
    ...[...storeMenus(copy).header, ...storeMenus(copy).footer].map((item) => item.label),
    String(storeSiteSettings(copy)['general.tagline']),
    String(storeSiteSettings(copy)['general.footerNote']),
  ].filter((text) => text !== '')
}

function allTitles(copy: StoreCopy): string[] {
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...buildStoreDemoPages({ locale: copy.locale }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(titleOf),
    ]),
    ...copy.products.flatMap((demo) => [
      demo.name,
      ...storeProductBlocks(copy, demo).flatMap(titleOf),
    ]),
    ...copy.categories.flatMap((demo) => storeCategoryBlocks(demo).flatMap(titleOf)),
  ]
}

describe.each(LOCALES)('store blueprint in %s, content model and catalogue', (locale) => {
  const copy = storeCopyFor(locale)
  const said = SENTINELS[locale]
  const model = storeSchema(copy)
  const media = Object.fromEntries(
    storeMediaSpecs(copy).map((spec) => [spec.name, `media-${spec.name}`]),
  )
  const homeGrid = copy.products.slice(-4).map((demo) => demo.key)

  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of model.collections) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves the product, category and page routes in the language of the site', () => {
    expect(matchPath(model.collections, said.productRoute)).toMatchObject({ collection: 'product' })
    expect(matchPath(model.collections, said.categoryRoute)).toMatchObject({
      collection: 'category',
    })
    expect(matchPath(model.collections, said.pageRoute)).toMatchObject({ collection: 'page' })
    expect(model.product.labels.singular).toBe(said.schemaLabel)
  })

  it('gives a product the plain fields its page shows: price, currency, stock, details and where to order', () => {
    const fields: Readonly<Record<string, { readonly kind: string; readonly admin?: unknown }>> =
      model.product.fields
    expect(fields.price?.kind).toBe('number')
    expect(fields.currency?.kind).toBe('select')
    expect(fields.category?.kind).toBe('select')
    expect(fields.inStock?.kind).toBe('boolean')
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
      // Labels come from the administration's own dictionaries, in the user's language.
      expect(fields[name]?.admin, name).toBeUndefined()
    }
    expect(model.product.fields.blocks?.kind).toBe('blocks')
    expect(contentPackFor('store', locale)?.defaultTheme).toBe('@cogenta/theme-ecommerce')
  })

  it('offers each product the categories of the language as the values of its category field', () => {
    const field = model.product.fields.category
    const values =
      field && 'options' in field && typeof field.options === 'object' && field.options !== null
        ? ((field.options as { options?: readonly (string | { value: string })[] }).options ?? [])
        : []
    expect(values.map((option) => (typeof option === 'string' ? option : option.value))).toEqual(
      copy.categories.map((entry) => entry.name),
    )
    for (const demo of copy.products) {
      expect(copy.categories.map((entry) => entry.id)).toContain(demo.category)
    }
  })

  it('sells twelve products, at least three per category, two of them sold out', () => {
    expect(copy.products).toHaveLength(12)
    const slugs = copy.products.map((demo) => demo.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const group of copy.categories) {
      expect(
        copy.products.filter((demo) => demo.category === group.id).length,
        group.name,
      ).toBeGreaterThanOrEqual(3)
    }
    expect(copy.products.filter((demo) => !demo.inStock)).toHaveLength(2)
  })

  it('prices every product in whole euros, and describes it with its material, size, origin and care', () => {
    for (const demo of copy.products) {
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

  it('shows every price in euros, and never names a dollar amount', () => {
    const text = allDemoCopy(copy, DEFAULT_SHOP_NAME).join('\n')
    expect(text).not.toMatch(/\$\d|USD|dollar/)
    expect(text).toMatch(said.euro)
  })

  it('orders each product by email to the shop, with the product in the subject line', () => {
    expect(orderLinkFor('Casa Norte', 'Field jacket', locale)).toBe(
      `mailto:orders@casanorte.com?subject=${said.subject}%20jacket`,
    )
    expect(orderLinkFor(undefined, 'Enamel mug', locale)).toContain('orders@ateliergoods.com')
  })

  it('writes every product page and category page as valid contract-B blocks, with more from the same category', () => {
    for (const demo of copy.products) {
      const blocks = storeProductBlocks(copy, demo)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      expect(
        blocks.map((block) => block._type),
        demo.slug,
      ).toEqual(['prose', 'collectionList'])
      const group = copy.categories.find((entry) => entry.id === demo.category)
      expect(blocks[1]).toMatchObject({
        collection: 'product',
        filter: { category: group?.name },
      })
    }
    for (const demo of copy.categories) {
      const blocks = storeCategoryBlocks(demo)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      expect(blocks[0]).toMatchObject({ _type: 'collectionList', filter: { category: demo.name } })
    }
  })

  it('points every media slot at a bundled JPEG described in a full sentence', () => {
    for (const spec of storeMediaSpecs(copy)) {
      expect(spec.photo, spec.name).toMatch(/^store\/[a-z-]+\.jpg$/)
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
      expect((bytes as Uint8Array).byteLength, spec.photo).toBeLessThan(420 * 1024)
      expect(spec.alt.length, spec.name).toBeGreaterThan(30)
      expect(spec.alt, spec.name).not.toMatch(/placeholder|abstract|mark \d|avatar/i)
    }
  })

  it('pictures each category with a product not already on the home page’s grid', () => {
    for (const demo of copy.categories) {
      expect(homeGrid, demo.slug).not.toContain(demo.photoOf)
      const owner = copy.products.find((candidate) => candidate.key === demo.photoOf)
      expect(owner?.category, demo.slug).toBe(demo.id)
    }
  })

  it('names the shop the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
    const named = allDemoCopy(copy, 'Casa Norte').join('\n')
    expect(named).toContain('Casa Norte')
    expect(named).toContain('orders@casanorte.com')
    expect(named).not.toContain(DEFAULT_SHOP_NAME)
    expect(named).not.toContain('ateliergoods')
    expect(allDemoCopy(copy, DEFAULT_SHOP_NAME).join('\n')).toContain(DEFAULT_SHOP_NAME)
    expect(shopEmail('Café Ribeira', 'repairs')).toBe('repairs@caferibeira.com')
  })

  it('is written in its own language, and says nothing in the other one', () => {
    // The credits page names photographs by their Commons titles, which are English.
    const text = allDemoCopy(copy, DEFAULT_SHOP_NAME)
      .filter((line) => !line.includes(' · '))
      .join('\n')
    expect(text).not.toMatch(said.otherLanguage)
    const pages = buildStoreDemoPages({ media, locale })
    expect(pages.map((demo) => demo.slug)).toEqual(said.slugs)
    expect(copy.products[0]?.name).toBe(said.firstProduct)
    expect(
      JSON.stringify(buildStoreHomeBlocks({ siteName: 'Casa Norte', media, locale })),
    ).toContain(said.heroTitle)
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const text = allDemoCopy(copy, DEFAULT_SHOP_NAME).join('\n')
    expect(text).not.toMatch(
      /cogenta|scaffold|\bdemo\b|démo|editable|éditable|lorem|javascript|placeholder|this (theme|template|website)|blueprint/i,
    )
  })

  it('invents its people and workshops rather than borrowing sample-company names', () => {
    const text = allDemoCopy(copy, DEFAULT_SHOP_NAME).join('\n')
    expect(text).not.toMatch(
      /contoso|fabrikam|northwind|acme|globex|initech|umbrella corp|lorem|john doe|jane doe|jean dupont|dupont/i,
    )
  })

  it('keeps to the studio charter: no exclamation marks, no em dash, no catalogue buzzwords', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|curated|elevated|timeless|must-have|game-chang|incontournable|unique en son genre)/i
    for (const text of allDemoCopy(copy, DEFAULT_SHOP_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBe(0)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
    }
  })

  it('sets French typography: typographic apostrophes, and a no-break space before : ; ? and before a unit', () => {
    if (locale !== 'fr') return
    for (const text of allDemoCopy(copy, DEFAULT_SHOP_NAME)) {
      expect(text, text).not.toContain("'")
      expect(text, text).not.toMatch(/ [:;?!]/)
      expect(text, text).not.toMatch(/\d (cl|ml|cm|mm|kg|h|€|%)(?![a-zé])/)
    }
  })

  it('titles no page, block or section as a question; only the questions of an FAQ ask one', () => {
    for (const title of allTitles(copy)) expect(title, title).not.toMatch(/\?/)
  })

  it('opens the home page on a banner with one action, then the categories, then the new season', () => {
    const blocks = buildStoreHomeBlocks({ siteName: 'Casa Norte', media, locale })
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
    expect(JSON.stringify(blocks)).toContain(`Casa Norte ${said.storyBy}`)
  })

  it('sets its commitments as statements without a sentence, so the theme draws them as one ruled line', () => {
    const line = buildStoreHomeBlocks({ locale }).find((block) => block._type === 'featureGrid')
    expect(line).toBeDefined()
    if (line?._type !== 'featureGrid') return
    expect(line.items.every((item) => item.text === undefined && item.icon === undefined)).toBe(
      true,
    )
  })

  it('designs its customer letter without a portrait', () => {
    const letter = buildStoreHomeBlocks({ media, locale }).find(
      (block) => block._type === 'testimonial',
    )
    expect(letter?._type === 'testimonial' ? letter.attribution.avatar : 'missing').toBeUndefined()
  })

  it('seeds no logos and no placeholder marks', () => {
    const everything = JSON.stringify([
      ...buildStoreDemoPages({ media, locale }).map((demo) => demo.blocks),
      storeMediaSpecs(copy),
    ])
    expect(everything).not.toMatch(/"logoStrip"|"logos"|logo-\d/)
  })

  it('sorts every list on a field contract B allows', () => {
    const lists = [
      ...buildStoreDemoPages({ media, locale }).flatMap((demo) => demo.blocks),
      ...copy.products.flatMap((demo) => storeProductBlocks(copy, demo)),
      ...copy.categories.flatMap(storeCategoryBlocks),
    ].filter((block) => block._type === 'collectionList')
    expect(lists.length).toBeGreaterThan(10)
    for (const block of lists) {
      if (block._type !== 'collectionList') continue
      expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
    }
  })

  it('seeds valid contract-B pages that use most of the vocabulary', () => {
    const types = new Set<string>()
    for (const demo of buildStoreDemoPages({ media, locale })) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) types.add(block._type)
    }
    expect(types.size).toBeGreaterThanOrEqual(9)
  })

  it('links every menu item and every in-page link to a page, a category or a product the blueprint seeds', () => {
    const categoryBase = copy.schema.routes.category.replace('/:slug', '')
    const productBase = copy.schema.routes.product.replace('/:slug', '')
    const routes = new Set([
      ...buildStoreDemoPages({ locale }).map((demo) => `/${demo.slug}`),
      ...copy.categories.map((demo) => `${categoryBase}/${demo.slug}`),
      ...copy.products.map((demo) => `${productBase}/${demo.slug}`),
    ])
    const menus = storeMenus(copy)
    for (const item of [...menus.header, ...menus.footer, menus.headerAction]) {
      expect(routes.has(item?.url ?? ''), item?.url).toBe(true)
    }
    const hrefs = JSON.stringify(
      buildStoreDemoPages({ media, locale }).map((demo) => demo.blocks),
    ).match(/"href":"[^"]+"/g)
    expect(hrefs?.length).toBeGreaterThan(5)
    for (const match of hrefs ?? []) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(routes.has(href), href).toBe(true)
    }
  })

  it('places customer care beside the pages read around an order, never beside a product, and in the footer only what it lacks', () => {
    const widgets = storeWidgets(copy)
    const slug = copy.pageSlugs
    const menus = storeMenus(copy)
    const routes = new Set(['/', ...buildStoreDemoPages({ locale }).map((demo) => `/${demo.slug}`)])
    const collections = new Set(model.collections.map((collection) => collection.name))
    const note = String(storeSiteSettings(copy)['general.footerNote'])
    const careRoutes = new Set(
      [slug.order, slug.delivery, slug.repairs, slug.contact, slug.terms].map((one) => `/${one}`),
    )
    expect(careRoutes.size).toBe(5)

    for (const widget of widgets) {
      const settings = validateWidgetSettings(widget.type, widget.settings)
      const { pages } = validateWidgetVisibility(widget.visibility)
      const hrefs = (JSON.stringify(settings).match(/"href":"[^"]+"/g) ?? []).map((match) =>
        match.slice(8, -1),
      )
      for (const href of hrefs) expect(routes.has(href), href).toBe(true)
      if (typeof settings.collection === 'string') {
        expect(collections.has(settings.collection)).toBe(true)
      }
      for (const target of pages.targets) {
        if (target.kind === 'path') expect(routes.has(target.path), target.path).toBe(true)
        // A product and a category keep the whole grid: never a target, never a collection rule.
        expect(target.kind).not.toBe('collection')
      }
      // Every address is derived from the site's name; a widget's settings cannot follow it.
      expect(JSON.stringify(settings)).not.toMatch(/@/)
      for (const text of textsOfValue(settings)) {
        expect(text, text).not.toContain('!')
        expect(text, text).not.toMatch(/cogenta|demo|lorem|placeholder/i)
      }

      if (widget.area === 'sidebar') {
        expect(pages.mode, widget.type).toBe('only')
        for (const target of pages.targets) {
          if (target.kind === 'path') expect(careRoutes.has(target.path), target.path).toBe(true)
          else expect(target.kind, widget.type).toBe('search')
        }
        // A link never points at the page it is shown beside, unless it is the list marking it.
        if (widget.type !== 'links') {
          for (const href of hrefs) {
            expect(pages.targets).not.toContainEqual({ kind: 'path', path: href })
          }
        }
      } else {
        expect(['footer-1', 'footer-2', 'footer-3', 'footer-4']).toContain(widget.area)
        expect(pages.mode, widget.type).toBe('except')
        expect(pages.targets).toContainEqual({ kind: 'path', path: `/${slug.contact}` })
        // Nothing the footer already prints: its address, hours and pages.
        expect(JSON.stringify(settings)).not.toMatch(said.footerPrinted)
        for (const line of note.split('\n').filter((part) => part.trim() !== '')) {
          expect(JSON.stringify(settings)).not.toContain(line)
        }
        for (const item of menus.footer) {
          expect(JSON.stringify(settings)).not.toContain(`"label":"${item.label}"`)
        }
      }
    }

    const byType = (type: string) => widgets.filter((widget) => widget.type === type)
    // Search results get the newest pieces with their photographs, and only there.
    const recent = byType('recentEntries')
    expect(recent).toHaveLength(1)
    expect(validateWidgetSettings('recentEntries', recent[0]?.settings)).toMatchObject({
      collection: 'product',
      showImage: true,
      showDate: false,
    })
    expect(validateWidgetVisibility(recent[0]?.visibility).pages.targets).toEqual([
      { kind: 'search' },
    ])
    // The customer care list covers every care page and shows beside each of them.
    const care = byType('links')[0]
    const careItems = validateWidgetSettings('links', care?.settings).items as { href: string }[]
    expect(new Set(careItems.map((item) => item.href))).toEqual(careRoutes)
    for (const path of careRoutes) {
      expect(validateWidgetVisibility(care?.visibility).pages.targets).toContainEqual({
        kind: 'path',
        path,
      })
    }
    // The letters are on the home page already; the phone is on the contact page already.
    const letters = widgets.find((widget) => widget.area === 'footer-2')
    expect(validateWidgetVisibility(letters?.visibility).pages.targets).toContainEqual({
      kind: 'home',
    })
    // Every fact a widget states is one the site's own pages state.
    const pages = JSON.stringify(buildStoreDemoPages({ siteName: 'Maison Brun', locale }))
    expect(pages).toContain(said.phone)
    expect(pages).toContain(said.care)
    expect(pages).toContain(said.letters)
    expect(pages).toContain('letters@maisonbrun.com')
  })

  it('closes comments on the catalogue, and carries a footer note a real company would write', () => {
    const settings = storeSiteSettings(copy)
    expect(settings['discussion.enabled']).toBe(false)
    const note = String(settings['general.footerNote'])
    expect(note).toMatch(/12 rue Imbert-Colomès/)
    expect(note).toMatch(/RCS Lyon|RCS de Lyon/)
    expect(note).not.toMatch(/create-cogenta|scaffold|demo/i)
  })

  it('ships one pack per language through contentPackFor, with its own menus and media', () => {
    const pack = contentPackFor('store', locale === 'fr' ? 'fr-FR' : 'en')
    expect(pack?.collections.find((collection) => collection.name === 'product')?.routing).toEqual({
      pattern: copy.schema.routes.product,
    })
    expect(pack?.menus?.headerAction?.url).toBe(`/${copy.pageSlugs.order}`)
    expect(pack?.mediaSpecs?.length).toBe(storeMediaSpecs(copy).length)
    expect(pack?.mediaSpecs?.some((spec) => spec.alt === copy.media.hero)).toBe(true)
    expect(contentPackFor('store', 'fr')?.menus?.footer.at(-1)?.url).toBe(
      `/${storeCopyFor('fr').pageSlugs.credits}`,
    )
  })
})

describe('store blueprint, photographs and credits', () => {
  it('credits every photograph it bundles, with its author, licence and source, and bundles none that is not credited', async () => {
    const folder = fileURLToPath(new URL('../src/blueprints/assets/photos/store/', import.meta.url))
    const files = (await readdir(folder)).sort()
    const credited = STORE_PHOTO_CREDITS.map((credit) => credit.file).sort()
    expect(credited).toEqual(files)
    for (const credit of STORE_PHOTO_CREDITS) {
      expect(credit.author.length).toBeGreaterThan(0)
      expect(credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(credit.licence).toMatch(/^(CC0 1\.0|Public domain|CC BY [0-9.]+)$/)
      if (credit.licence.startsWith('CC BY')) expect(credit.licenceUrl).toMatch(/^https:\/\//)
    }
  })

  it('uses every bundled photograph, and every product its own', async () => {
    const folder = fileURLToPath(new URL('../src/blueprints/assets/photos/store/', import.meta.url))
    const files = (await readdir(folder)).sort()
    for (const locale of LOCALES) {
      const copy = storeCopyFor(locale)
      const used = new Set(
        storeMediaSpecs(copy).map((spec) => (spec.photo as string).slice('store/'.length)),
      )
      expect(files.filter((file) => !used.has(file))).toEqual([])
      for (const demo of copy.products) {
        expect(used.has(`${demo.key}.jpg`), demo.key).toBe(true)
      }
    }
    expect(files.reduce((sum) => sum + 1, 0)).toBe(14)
  })

  it('keeps the whole folder light enough to ship', async () => {
    const folder = new URL('../src/blueprints/assets/photos/store/', import.meta.url)
    let total = 0
    for (const file of await readdir(fileURLToPath(folder))) {
      total += loadPhotoAsset(`store/${file}`)?.byteLength ?? 0
    }
    expect(total).toBeLessThan(6 * 1024 * 1024)
  })

  it('seeds a photo credits page in each language, linked from the footer, listing every credit', () => {
    for (const locale of LOCALES) {
      const copy = storeCopyFor(locale)
      const credits = buildStoreDemoPages({ locale }).find(
        (demo) => demo.slug === copy.pageSlugs.credits,
      )
      expect(credits, locale).toBeDefined()
      const text = JSON.stringify(credits)
      for (const credit of STORE_PHOTO_CREDITS) {
        expect(text, credit.file).toContain(credit.author)
        expect(text, credit.file).toContain(credit.source)
      }
      expect(text).toContain('creativecommons.org/licenses/by/2.0/')
      expect(storeMenus(copy).footer.map((item) => item.url)).toContain(
        `/${copy.pageSlugs.credits}`,
      )
    }
    expect(JSON.stringify(buildStoreDemoPages({ locale: 'fr' }).at(-1))).toContain(
      'sous licence libre',
    )
    expect(JSON.stringify(buildStoreDemoPages({ locale: 'en' }).at(-1))).toContain('free licences')
  })

  it('keeps the English exports the rest of the repository imports', () => {
    expect(STORE_COLLECTIONS).toEqual([product, category, page])
    expect(storeContentPack.collections).toEqual(storeSchema(storeCopyFor('en')).collections)
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
