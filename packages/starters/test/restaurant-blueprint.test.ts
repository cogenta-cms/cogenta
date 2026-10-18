import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { validateWidgetSettings, validateWidgetVisibility } from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildRestaurantDemoPages,
  buildRestaurantHomeBlocks,
  createRestaurantContentPack,
  DEFAULT_RESTAURANT_NAME,
  menuItem,
  page,
  RESTAURANT_COLLECTIONS,
  RESTAURANT_DEMO_DISHES,
  RESTAURANT_DISH_PHOTOS,
  RESTAURANT_MEDIA_SPECS,
  RESTAURANT_MENUS,
  RESTAURANT_SITE_SETTINGS,
  RESTAURANT_WIDGETS,
  restaurantContentPack,
  restaurantCopyFor,
  restaurantDishBlocks,
  restaurantDishPhotos,
  restaurantEmail,
  restaurantMediaSpecs,
  restaurantMenus,
  restaurantSchema,
  restaurantSiteSettings,
  restaurantWidgets,
} from '../src/blueprints/restaurant.js'
import { RESTAURANT_COPY_EN } from '../src/blueprints/restaurant-copy-en.js'
import { RESTAURANT_COPY_FR } from '../src/blueprints/restaurant-copy-fr.js'
import { RESTAURANT_PHOTO_CREDITS } from '../src/blueprints/restaurant-credits.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

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

type Copy = ReturnType<typeof restaurantCopyFor>

function allDemoCopy(copy: Copy, siteName: string): string[] {
  const media = Object.fromEntries(
    restaurantMediaSpecs(copy).map((spec) => [spec.name, `media-${spec.name}`]),
  )
  const menus = restaurantMenus(copy)
  const settings = restaurantSiteSettings(copy)
  return [
    ...buildRestaurantDemoPages({ siteName, media, copy }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...copy.dishes.flatMap((dish) => [
      dish.name,
      dish.description,
      dish.sourcing,
      dish.pairing ?? '',
      dish.allergens ?? '',
      dish.note,
      ...restaurantDishBlocks(dish, copy).flatMap(blockTexts),
    ]),
    ...restaurantMediaSpecs(copy).map((spec) => spec.alt),
    ...[...menus.header, ...menus.footer].map((item) => item.label),
    String(settings['general.tagline']),
    String(settings['general.footerNote']),
  ].filter((text) => text !== '')
}

/** The credits page quotes each photograph's title in the language of its Commons page, so it is left out of the language checks. */
function allDemoCopyWithoutCredits(copy: Copy, siteName: string): string[] {
  const credits = new Set(
    buildRestaurantDemoPages({ siteName, copy })
      .filter((demo) => demo.slug === copy.pageSlugs.credits)
      .flatMap((demo) => demo.blocks.flatMap(blockTexts)),
  )
  return allDemoCopy(copy, siteName).filter((text) => !credits.has(text))
}

/** The names a `select` field offers. */
function optionsOf(field: unknown): readonly string[] {
  const options = (field as { options?: { options?: readonly { value: string }[] } } | undefined)
    ?.options
  return (options?.options ?? []).map((option) => option.value)
}

function allTitles(copy: Copy): string[] {
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...buildRestaurantDemoPages({ copy }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(titleOf),
    ]),
    ...copy.dishes.flatMap((dish) => [
      dish.name,
      ...restaurantDishBlocks(dish, copy).flatMap(titleOf),
    ]),
  ]
}

/** What a diner of each language reads, to prove the right pack was picked. */
const LANGUAGE = {
  fr: {
    copy: RESTAURANT_COPY_FR,
    sections: ['Entrées', 'Plats', 'Fromages et desserts', 'Vins au verre'],
    dishRoute: '/carte/',
    eyebrow: 'Restaurant et bar à vins, Lyon',
    hero: 'Réserver une table',
    tagline: 'Une cuisine de saison sur les pentes de la Croix-Rousse.',
    note: /04 78 28 16 42\n\nDéjeuner le jeudi et le vendredi/,
    dinner: /Dîner du mardi au samedi/,
    deposits: /Acompte/,
    cancel: /annul/i,
    counter: /six places du comptoir sont gardées/,
    closed: 'Dimanche et lundi, trois semaines en août et la semaine de Noël',
    bookings: 'Du mardi au samedi, de 10 h à 18 h',
    widgetLabels: ['Fermé', 'Le comptoir', 'Réservations'],
    home: 'home',
    menu: 'carte',
    pageSlugs: [
      'home',
      'carte',
      'notre-histoire',
      'reservations',
      'salon-prive',
      'horaires-et-acces',
      'mentions-legales',
      'credits-photos',
    ],
    wrong: /\b(the|with|and|our|your|booking|menu of)\b/i,
    right: /\b(le|la|les|des|nous|avec|une)\b/i,
    buzzwords:
      /innovant|révolutionn|de pointe|clé en main|incontournable|synergie|inoubliable|authentique|sublim|exceptionnel|savoureux|gourmand/i,
    price: /\d €/,
    legalPage: 'mentions-legales',
    creditsPage: 'credits-photos',
    photoCreditsTitle: 'Crédits photographiques',
  },
  en: {
    copy: RESTAURANT_COPY_EN,
    sections: ['Starters', 'Mains', 'Cheese and desserts', 'Wine by the glass'],
    dishRoute: '/menu/',
    eyebrow: 'Restaurant and wine bar, Lyon',
    hero: 'Reserve a table',
    tagline: 'Seasonal cooking on the slopes of the Croix-Rousse.',
    note: /\+33 4 78 28 16 42\n\nLunch Thursday and Friday/,
    dinner: /Dinner Tuesday to Saturday/,
    deposits: /Deposits/,
    cancel: /cancel/i,
    counter: /six seats at the counter are kept for guests who walk in at dinner/,
    closed: 'Sunday and Monday, three weeks in August and Christmas week',
    bookings: 'Tuesday to Saturday, 10:00 to 18:00',
    widgetLabels: ['Closed', 'The counter', 'Bookings'],
    home: 'home',
    menu: 'menu',
    pageSlugs: [
      'home',
      'menu',
      'our-story',
      'reservations',
      'private-dining',
      'visit',
      'legal',
      'photo-credits',
    ],
    wrong: /\b(les|des|nous|avec|une|chez|notre|réserver)\b/i,
    right: /\b(the|with|and|our|we)\b/i,
    buzzwords:
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|curated|elevated|timeless|must-have|game-chang|culinary journey|mouth-watering|delectable|exquisite|unforgettable)/i,
    price: /€\d/,
    legalPage: 'legal',
    creditsPage: 'photo-credits',
    photoCreditsTitle: 'Photo credits',
  },
} as const

for (const locale of ['fr', 'en'] as const) {
  const language = LANGUAGE[locale]
  const copy = restaurantCopyFor(locale)
  const model = restaurantSchema(copy)
  const media = Object.fromEntries(
    restaurantMediaSpecs(copy).map((spec) => [spec.name, `media-${spec.name}`]),
  )
  const slugOf = (key: keyof Copy['pageSlugs']) => `/${copy.pageSlugs[key]}`

  describe(`restaurant blueprint (${locale}), content model and menu`, () => {
    it('picks the copy for the site locale, regional variants included', () => {
      expect(copy).toBe(language.copy)
      expect(restaurantCopyFor(locale === 'fr' ? 'fr-FR' : 'en-GB')).toBe(language.copy)
      expect(restaurantCopyFor('de')).toBe(RESTAURANT_COPY_EN)
    })

    it('declares the four conventional SEO override fields on every routed collection', () => {
      for (const collection of model.collections) {
        expect(Object.keys(collection.fields)).toEqual(
          expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
        )
      }
    })

    it('routes a dish and a page in the language of the site', () => {
      const dish = copy.dishes[0]?.slug
      expect(matchPath(model.collections, `${language.dishRoute}${dish}`)).toEqual({
        collection: 'menu_item',
        locale: null,
        params: { slug: dish },
      })
      expect(matchPath(model.collections, `/${copy.pageSlugs.reservations}`)).toEqual({
        collection: 'page',
        locale: null,
        params: { slug: copy.pageSlugs.reservations },
      })
    })

    it('files a dish under the sections its language names, not the other language’s', () => {
      expect(copy.sections).toEqual(language.sections)
      const category = model.menuItem.fields.category
      expect(category?.kind).toBe('select')
      expect(optionsOf(category)).toEqual(language.sections)
      expect(model.menuItem.labels.singular).toBe(copy.schema.dishLabels.singular)
    })

    it('leaves field labels to the administration’s own dictionaries', () => {
      for (const [name, field] of Object.entries(model.menuItem.fields)) {
        expect(
          (field as { admin?: { label?: string } }).admin?.label,
          `menu_item.${name}`,
        ).toBeUndefined()
      }
    })

    it('gives a dish the plain fields its page shows: price, section, diet, sourcing, pairing, allergens', () => {
      const fields: Readonly<Record<string, { readonly kind: string }>> = model.menuItem.fields
      expect(fields.price?.kind).toBe('number')
      expect(fields.currency?.kind).toBe('select')
      expect(fields.vegetarian?.kind).toBe('boolean')
      for (const name of ['sourcing', 'pairing', 'allergens', 'description']) {
        expect(fields[name]?.kind, name).toBe('text')
      }
      expect(fields.photo?.kind).toBe('media')
      expect(fields.blocks?.kind).toBe('blocks')
    })

    it('prints a seasonal menu of at least sixteen dishes over four sections, in menu order', () => {
      expect(copy.dishes.length).toBeGreaterThanOrEqual(16)
      const slugs = copy.dishes.map((dish) => dish.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
      expect(new Set(copy.dishes.map((dish) => dish.id)).size).toBe(copy.dishes.length)
      expect([...new Set(copy.dishes.map((dish) => dish.section))]).toEqual([0, 1, 2, 3])
      for (const section of [0, 1, 2, 3]) {
        expect(
          copy.dishes.filter((dish) => dish.section === section).length,
          copy.sections[section],
        ).toBeGreaterThanOrEqual(4)
      }
    })

    it('prices every dish in euros within a bistro’s range, and describes it with where it comes from', () => {
      for (const dish of copy.dishes) {
        expect(dish.price, dish.slug).toBeGreaterThanOrEqual(5)
        expect(dish.price, dish.slug).toBeLessThanOrEqual(40)
        expect(dish.description.length, dish.slug).toBeGreaterThan(60)
        expect(dish.description.length, dish.slug).toBeLessThanOrEqual(300)
        expect(dish.sourcing.length, dish.slug).toBeGreaterThan(20)
        expect(dish.sourcing.length, dish.slug).toBeLessThanOrEqual(200)
        expect(dish.note.split(/\s+/).length, dish.slug).toBeGreaterThan(18)
      }
    })

    it('lists the allergens of every dish that is not a wine, and marks no wine vegetarian', () => {
      for (const dish of copy.dishes) {
        if (dish.section === 3) {
          expect(dish.vegetarian, dish.slug).toBe(false)
        } else {
          expect(dish.allergens, dish.slug).toBeDefined()
        }
      }
      expect(copy.dishes.filter((dish) => dish.vegetarian).length).toBeGreaterThanOrEqual(4)
    })

    it('pairs dishes only with wines the menu actually pours', () => {
      const wines = new Set(
        copy.dishes.filter((dish) => dish.section === 3).map((dish) => dish.name),
      )
      for (const dish of copy.dishes) {
        if (dish.pairing !== undefined) expect(wines.has(dish.pairing), dish.slug).toBe(true)
      }
    })

    it('shows every price in one currency, and never names a dollar amount', () => {
      const text = allDemoCopy(copy, DEFAULT_RESTAURANT_NAME).join('\n')
      expect(text).not.toMatch(/\$\d|USD|dollar/)
      expect(text).toMatch(language.price)
    })

    it('writes each dish page as valid contract-B blocks: its note, then the rest of its section', () => {
      for (const dish of copy.dishes) {
        const blocks = restaurantDishBlocks(dish, copy)
        expect(() => parseBlocks([...blocks]), dish.slug).not.toThrow()
        expect(
          blocks.map((block) => block._type),
          dish.slug,
        ).toEqual(['prose', 'collectionList'])
        expect(blocks[1]).toMatchObject({
          collection: 'menu_item',
          filter: { category: copy.sections[dish.section] },
          layout: 'list',
        })
      }
    })

    it('ships its own pack through contentPackFor, in its language', () => {
      const pack = contentPackFor('restaurant', locale === 'fr' ? 'fr-FR' : 'en')
      expect(pack?.defaultTheme).toBe('@cogenta/theme-restaurant')
      const category = pack?.collections.find((collection) => collection.name === 'menu_item')
        ?.fields.category
      expect(optionsOf(category)).toEqual(language.sections)
      expect(pack?.siteSettings).toEqual(restaurantSiteSettings(copy))
      expect(pack?.menus).toEqual(restaurantMenus(copy))
      expect(pack?.mediaSpecs).toEqual(restaurantMediaSpecs(copy))
    })
  })

  describe(`restaurant blueprint (${locale}), photographs`, () => {
    const specs = restaurantMediaSpecs(copy)
    const photos = restaurantDishPhotos(copy)

    it('points every media slot at a bundled JPEG described in a full sentence', () => {
      for (const spec of specs) {
        expect(spec.photo, spec.name).toMatch(/^restaurant\/[a-z-]+\.jpg$/)
        const bytes = loadPhotoAsset(spec.photo as string)
        expect(bytes, spec.photo).toBeDefined()
        expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
        expect(spec.alt.length, spec.name).toBeGreaterThan(30)
        expect(spec.alt, spec.name).not.toMatch(/placeholder|abstract|composition|avatar/i)
      }
    })

    it('describes the same photographs in both languages, slot for slot', () => {
      const other = restaurantMediaSpecs(locale === 'fr' ? RESTAURANT_COPY_EN : RESTAURANT_COPY_FR)
      expect(specs.map((spec) => [spec.name, spec.photo])).toEqual(
        other.map((spec) => [spec.name, spec.photo]),
      )
      expect(specs.map((spec) => spec.alt)).not.toEqual(other.map((spec) => spec.alt))
    })

    it('photographs only dishes that exist', () => {
      const slugs = new Set(copy.dishes.map((dish) => dish.slug))
      for (const slug of Object.keys(photos)) expect(slugs.has(slug), slug).toBe(true)
      expect(Object.keys(photos).length).toBeGreaterThanOrEqual(8)
    })

    it('crops every dish photograph to the same 4:5 portrait', async () => {
      for (const dish of copy.dishes) {
        if (dish.photoAlt === undefined) continue
        const bytes = loadPhotoAsset(`restaurant/${dish.id}.jpg`) as Uint8Array
        const { width, height } = jpegSize(bytes)
        expect(width / height, dish.id).toBeCloseTo(0.8, 2)
      }
    })

    it('opens the home page on the room and puts four photographed plates in its band, reusing the dish photographs', () => {
      const blocks = buildRestaurantHomeBlocks({ media, copy })
      const band = blocks.find((block) => block._type === 'gallery')
      expect(band?._type === 'gallery' ? band.layout : undefined).toBe('grid')
      const items = band?._type === 'gallery' ? band.items : []
      expect(items).toHaveLength(4)
      for (const item of items) expect(item.media).toMatch(/^media-dish-/)
      expect(blocks[0]).toMatchObject({ _type: 'hero', media: 'media-hero' })
    })

    it('seeds no logos and no placeholder marks', () => {
      const everything = JSON.stringify([
        ...buildRestaurantDemoPages({ media, copy }).map((demo) => demo.blocks),
        specs,
      ])
      expect(everything).not.toMatch(/"logoStrip"|"logos"|logo-\d/)
    })

    it('leaves out every picture block, never an empty one, when no media was seeded', () => {
      const pages = buildRestaurantDemoPages({ copy })
      for (const demo of pages) expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      const blocks = pages.flatMap((demo) => demo.blocks)
      expect(blocks.some((block) => block._type === 'gallery')).toBe(false)
      expect(blocks.some((block) => block._type === 'mediaFigure')).toBe(false)
    })

    it('shows the street and the market where they belong: hours page and story', () => {
      const pages = buildRestaurantDemoPages({ media, copy })
      const figuresOf = (slug: string) =>
        pages
          .find((demo) => demo.slug === slug)
          ?.blocks.filter((block) => block._type === 'mediaFigure')
          .map((block) => (block._type === 'mediaFigure' ? block.media : undefined))
      expect(figuresOf(copy.pageSlugs.story)).toEqual(['media-hero', 'media-market'])
      expect(figuresOf(copy.pageSlugs.visit)).toEqual(['media-street'])
    })
  })

  describe(`restaurant blueprint (${locale}), copy`, () => {
    it('is written in its own language, with its own typography', () => {
      const text = allDemoCopyWithoutCredits(copy, DEFAULT_RESTAURANT_NAME).join('\n')
      expect(text).not.toMatch(language.wrong)
      expect(text).toMatch(language.right)
      const home = copy.pages({
        name: DEFAULT_RESTAURANT_NAME,
        email: () => '',
        href: () => '/',
        phoneHref: '',
        mapHref: '',
      }).home
      expect(home.heroEyebrow).toBe(language.eyebrow)
      expect(home.heroAction).toBe(language.hero)
      expect(copy.settings.tagline).toBe(language.tagline)
      expect(copy.settings.footerNote).toMatch(language.note)
      expect(copy.settings.footerNote).toMatch(language.dinner)
    })

    it('names the restaurant the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
      const named = allDemoCopy(copy, 'Maison Verte').join('\n')
      expect(named).toContain('Maison Verte')
      expect(named).toContain('table@maisonverte.fr')
      expect(named).not.toContain(DEFAULT_RESTAURANT_NAME)
      expect(allDemoCopy(copy, DEFAULT_RESTAURANT_NAME).join('\n')).toContain(
        DEFAULT_RESTAURANT_NAME,
      )
    })

    it('titles the home page hero with the restaurant’s own name', () => {
      expect(buildRestaurantHomeBlocks({ siteName: 'Maison Verte', copy })[0]).toMatchObject({
        _type: 'hero',
        title: 'Maison Verte',
      })
      expect(buildRestaurantHomeBlocks({ copy })[0]).toMatchObject({
        title: DEFAULT_RESTAURANT_NAME,
      })
    })

    it('never talks about the CMS, the scaffold or the demo itself', () => {
      const text = allDemoCopy(copy, DEFAULT_RESTAURANT_NAME).join('\n')
      expect(text).not.toMatch(
        /cogenta|scaffold|\bdemo\b|démo|editable|lorem|javascript|placeholder|this (theme|template|website)|blueprint/i,
      )
    })

    it('invents its people, suppliers and press rather than borrowing sample names', () => {
      const text = allDemoCopy(copy, DEFAULT_RESTAURANT_NAME).join('\n')
      expect(text).not.toMatch(
        /contoso|fabrikam|northwind|acme|globex|initech|lorem|john doe|jane doe|michelin|le monde|gault/i,
      )
    })

    it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
      for (const text of allDemoCopy(copy, DEFAULT_RESTAURANT_NAME)) {
        expect(text, text).not.toMatch(language.buzzwords)
        expect(text, text).not.toContain('!')
        expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
        expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
        expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
      }
    })

    it('titles no page, block or section as a question; only the questions of an FAQ ask one', () => {
      for (const title of allTitles(copy)) expect(title, title).not.toMatch(/\?/)
    })

    it('gives no two blocks of a page the same title', () => {
      for (const demo of buildRestaurantDemoPages({ copy })) {
        const titles = demo.blocks.flatMap((block) =>
          'title' in block && typeof block.title === 'string' ? [block.title] : [],
        )
        expect(new Set(titles).size, demo.slug).toBe(titles.length)
      }
    })

    it('quotes the press as a named writer and a publication, never as a star rating', () => {
      const press = buildRestaurantHomeBlocks({ media, copy }).find(
        (block) => block._type === 'quote',
      )
      expect(press).toMatchObject({
        author: expect.any(String),
        role: expect.stringMatching(/2026/),
      })
      expect(JSON.stringify(press)).not.toMatch(/★|stars?\b|\/5/)
    })

    if (locale === 'fr') {
      it('keeps a number, its unit and a time together on one line', () => {
        const text = allDemoCopy(copy, DEFAULT_RESTAURANT_NAME).join('\n')
        expect(text).not.toMatch(/\d [€h]\b/)
        expect(text).not.toMatch(/\bh \d\d\b/)
        expect(text).not.toMatch(/\S [:;?!]/)
      })
    }
  })

  describe(`restaurant blueprint (${locale}), pages, reservations and navigation`, () => {
    it('seeds valid contract-B pages that use most of the vocabulary', () => {
      const types = new Set<string>()
      for (const demo of buildRestaurantDemoPages({ media, copy })) {
        expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
        for (const block of demo.blocks) types.add(block._type)
      }
      expect(types.size).toBeGreaterThanOrEqual(11)
      expect(buildRestaurantDemoPages({ copy }).map((demo) => demo.slug)).toEqual(
        language.pageSlugs,
      )
    })

    it('opens the home page on the room with one quiet action, then the welcome, then the menu', () => {
      const blocks = buildRestaurantHomeBlocks({ siteName: 'Maison Verte', media, copy })
      const [hero, welcome, menu] = blocks
      expect(hero && 'actions' in hero ? hero.actions : []).toEqual([
        { label: language.hero, target: { href: slugOf('reservations') } },
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
      const reservations = buildRestaurantDemoPages({ siteName: 'Maison Verte', copy }).find(
        (demo) => demo.slug === copy.pageSlugs.reservations,
      )
      const json = JSON.stringify(reservations?.blocks)
      expect(json).toContain('tel:+33478281642')
      expect(json).toContain('mailto:table@maisonverte.fr')
      expect(json).toMatch(language.deposits)
      expect(json).toMatch(language.cancel)
      expect(json).toMatch(language.counter)
      const everything = JSON.stringify(buildRestaurantDemoPages({ media, copy }))
      expect(everything).not.toMatch(
        /book online|booking widget|opentable|resy|thefork|réservation en ligne:/i,
      )
      expect(restaurantMenus(copy).headerAction).toEqual({
        label: copy.menus.action.label,
        url: slugOf('reservations'),
      })
    })

    it('sorts every list on a field contract B allows, and prints the menu in the order it was written', () => {
      const lists = [
        ...buildRestaurantDemoPages({ media, copy }).flatMap((demo) => demo.blocks),
        ...copy.dishes.flatMap((dish) => restaurantDishBlocks(dish, copy)),
      ].filter((block) => block._type === 'collectionList')
      expect(lists.length).toBeGreaterThan(16)
      for (const block of lists) {
        if (block._type !== 'collectionList') continue
        expect(block.sort).toEqual({ field: 'id', direction: 'asc' })
        expect(block.limit ?? 0).toBeGreaterThanOrEqual(copy.dishes.length)
      }
    })

    it('links every menu item and every in-page link to a page or a dish the blueprint seeds', () => {
      const routes = new Set([
        ...buildRestaurantDemoPages({ copy }).map((demo) => `/${demo.slug}`),
        ...copy.dishes.map((dish) => `${language.dishRoute}${dish.slug}`),
      ])
      const menus = restaurantMenus(copy)
      for (const item of [...menus.header, ...menus.footer, menus.headerAction]) {
        expect(routes.has(item?.url ?? ''), item?.url).toBe(true)
      }
      const hrefs = JSON.stringify(
        buildRestaurantDemoPages({ media, copy }).map((demo) => demo.blocks),
      ).match(/"href":"[^"]+"/g)
      expect(hrefs?.length).toBeGreaterThan(8)
      for (const match of hrefs ?? []) {
        const href = match.slice(8, -1)
        if (/^(mailto|tel|https):/.test(href)) continue
        expect(routes.has(href), href).toBe(true)
      }
    })

    it('closes comments on the menu, and carries an address card a real restaurant would print', () => {
      const settings = restaurantSiteSettings(copy)
      expect(settings['discussion.enabled']).toBe(false)
      const note = String(settings['general.footerNote'])
      expect(note).toMatch(/^8 rue Burdeau\n69001 Lyon\n/)
      expect(note).not.toMatch(/create-cogenta|scaffold|demo/i)
    })

    it('links the photo credits page from the footer and from the legal notice', () => {
      const menus = restaurantMenus(copy)
      expect(menus.footer.map((item) => item.url)).toContain(`/${language.creditsPage}`)
      const legal = buildRestaurantDemoPages({ copy }).find(
        (demo) => demo.slug === language.legalPage,
      )
      expect(JSON.stringify(legal?.blocks)).toContain(`"href":"/${language.creditsPage}"`)
    })

    it('places the way to book beside a dish, and in the footer only what the address card leaves out', () => {
      const widgets = restaurantWidgets(copy)
      const collections = new Set(model.collections.map((collection) => collection.name))
      const routes = new Set([
        '/',
        ...buildRestaurantDemoPages({ copy }).map((demo) => `/${demo.slug}`),
        ...copy.dishes.map((dish) => `${language.dishRoute}${dish.slug}`),
      ])
      const note = String(restaurantSiteSettings(copy)['general.footerNote'])
      for (const widget of widgets) {
        const settings = validateWidgetSettings(widget.type, widget.settings)
        const { pages } = validateWidgetVisibility(widget.visibility)
        const hrefs = (JSON.stringify(settings).match(/"href":"[^"]+"/g) ?? []).map((match) =>
          match.slice(8, -1),
        )
        for (const href of hrefs) expect(routes.has(href), href).toBe(true)
        for (const target of pages.targets) {
          if (target.kind === 'collection') expect(collections.has(target.collection)).toBe(true)
          if (target.kind === 'path') expect(routes.has(target.path), target.path).toBe(true)
        }
        // The e-mail address is derived from the site's name; a widget cannot follow it.
        expect(JSON.stringify(settings)).not.toMatch(/@/)
        if (widget.area === 'sidebar') {
          // Beside a dish and search results; never beside the menu or a landing page.
          expect(pages.mode, widget.type).toBe('only')
          for (const target of pages.targets) {
            expect(['collection', 'search'], widget.type).toContain(target.kind)
          }
        } else {
          expect(['footer-1', 'footer-2', 'footer-3', 'footer-4']).toContain(widget.area)
          // Everywhere but the pages that already say the same, the home page first.
          expect(pages.mode, widget.type).toBe('except')
          expect(pages.targets).toContainEqual({ kind: 'home' })
          for (const href of hrefs)
            expect(pages.targets).toContainEqual({ kind: 'path', path: href })
          // Nothing the footer's own address card already prints.
          for (const line of note.split('\n').filter((part) => part.trim() !== '')) {
            expect(JSON.stringify(settings)).not.toContain(line.replace(/\.$/, ''))
          }
          expect(JSON.stringify(settings)).not.toMatch(/rue Burdeau|\+33|04 78|19:30|12:00/)
        }
      }
      // Every fact a widget states is one the site's own pages state.
      const pages = JSON.stringify(buildRestaurantDemoPages({ siteName: 'Maison Verte', copy }))
      const contact = widgets.find((widget) => widget.type === 'contact')
      const hours = validateWidgetSettings('contact', contact?.settings).hours as {
        label: string
        value: string
      }[]
      expect(hours.map((row) => row.label)).toEqual(language.widgetLabels)
      expect(pages).toContain(language.closed)
      expect(pages).toContain(language.bookings)
      expect(pages).toMatch(language.counter)
      const quote = widgets.find((widget) => widget.type === 'quote')
      expect(pages).toContain(String(validateWidgetSettings('quote', quote?.settings).text))
      expect(
        contact?.visibility && validateWidgetVisibility(contact.visibility).pages.targets,
      ).toEqual([
        { kind: 'home' },
        { kind: 'path', path: slugOf('visit') },
        { kind: 'path', path: slugOf('reservations') },
      ])
    })
  })

  describe(`restaurant blueprint (${locale}), photo credits page`, () => {
    const pages = buildRestaurantDemoPages({ media, copy })
    const credits = pages.find((demo) => demo.slug === language.creditsPage)

    it('seeds the credits page last, titled in its language', () => {
      expect(pages.at(-1)?.slug).toBe(language.creditsPage)
      expect(credits?.title).toBe(language.photoCreditsTitle)
    })

    it('credits every photograph it bundles with its author, its licence and its source', () => {
      const json = JSON.stringify(credits?.blocks)
      for (const credit of RESTAURANT_PHOTO_CREDITS) {
        expect(json, credit.file).toContain(credit.author)
        expect(json, credit.file).toContain(credit.title)
        expect(json, credit.file).toContain(`"href":"${credit.source}"`)
        if (credit.licenceUrl !== undefined) {
          expect(json, credit.file).toContain(`"href":"${credit.licenceUrl}"`)
        }
      }
    })
  })
}

describe('restaurant blueprint, the English exports other code still imports', () => {
  it('keeps the English constants and the English pack', () => {
    expect(restaurantContentPack.defaultTheme).toBe('@cogenta/theme-restaurant')
    expect(restaurantContentPack.menus).toEqual(RESTAURANT_MENUS)
    expect(restaurantContentPack.widgets).toEqual(RESTAURANT_WIDGETS)
    expect(restaurantContentPack.siteSettings).toEqual(RESTAURANT_SITE_SETTINGS)
    expect(restaurantContentPack.mediaSpecs).toEqual(RESTAURANT_MEDIA_SPECS)
    expect(restaurantContentPack.collections.map((collection) => collection.name)).toEqual(
      RESTAURANT_COLLECTIONS.map((collection) => collection.name),
    )
    expect(RESTAURANT_COLLECTIONS).toEqual([menuItem, page])
    expect(RESTAURANT_DEMO_DISHES[0]?.category).toBe('Starters')
    expect(Object.keys(RESTAURANT_DISH_PHOTOS)).toContain('grilled-octopus')
  })

  it('builds the French pack from the same factory', () => {
    const fr = createRestaurantContentPack('fr')
    expect(fr.siteSettings?.['general.tagline']).toMatch(/pentes de la Croix-Rousse/)
    expect(fr.collections.map((collection) => collection.name)).toEqual(['menu_item', 'page'])
  })

  it('derives a restaurant’s mailboxes from its name', () => {
    expect(restaurantEmail('Café Rivière', 'events')).toBe('events@caferiviere.fr')
    expect(restaurantEmail(undefined)).toBe('table@laurier.fr')
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

describe('restaurant blueprint, the bundled files and their credits', () => {
  const folder = fileURLToPath(
    new URL('../src/blueprints/assets/photos/restaurant/', import.meta.url),
  )

  it('credits every bundled photograph, and bundles every photograph it credits', async () => {
    const files = (await readdir(folder)).sort()
    expect(files).toEqual(RESTAURANT_PHOTO_CREDITS.map((credit) => credit.file).sort())
  })

  it('uses every bundled photograph, in both languages', async () => {
    const files = await readdir(folder)
    for (const copy of [RESTAURANT_COPY_FR, RESTAURANT_COPY_EN]) {
      const used = new Set(
        restaurantMediaSpecs(copy).map((spec) =>
          (spec.photo as string).slice('restaurant/'.length),
        ),
      )
      expect(files.filter((file) => !used.has(file))).toEqual([])
    }
  })

  it('credits each photograph under an open licence, with a Commons page to check it against', () => {
    for (const credit of RESTAURANT_PHOTO_CREDITS) {
      expect(credit.author.length, credit.file).toBeGreaterThan(0)
      expect(credit.title.length, credit.file).toBeGreaterThan(0)
      expect(credit.source, credit.file).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(credit.licence, credit.file).toMatch(/^(CC0 1\.0|Public domain|CC BY [0-9.]+)$/)
      if (credit.licence.startsWith('CC')) {
        expect(credit.licenceUrl, credit.file).toMatch(/^https:\/\/creativecommons\.org\//)
      }
    }
  })

  it('keeps the folder light: every file under 420 KB, the folder under 6 MB', async () => {
    let total = 0
    for (const file of await readdir(folder)) {
      const { size } = await stat(`${folder}${file}`)
      expect(size, file).toBeLessThan(420 * 1024)
      total += size
    }
    expect(total).toBeLessThan(6 * 1024 * 1024)
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
