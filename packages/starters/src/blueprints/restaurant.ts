import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, heroArt, type Palette } from '../demo-art/compositions.js'
import type { PhotoCredit } from './blog-credits.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import type {
  RestaurantCopy,
  RestaurantDishCopy,
  RestaurantPageKey,
  RestaurantQuestions,
  RestaurantRow,
  RestaurantTier,
} from './restaurant-copy.js'
import { RESTAURANT_COPY_EN } from './restaurant-copy-en.js'
import { RESTAURANT_COPY_FR } from './restaurant-copy-fr.js'
import { RESTAURANT_PHOTO_CREDITS } from './restaurant-credits.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `restaurant` blueprint (L27, `@cogenta/theme-restaurant`): a
 * contemporary bistro in the former offices of a silk merchant on the slopes
 * of the Croix-Rousse in Lyon. A seasonal menu of nineteen dishes and wines in
 * four sections, a page for each of them, and the pages a real restaurant
 * needs before a guest arrives: the menu with its set menus and allergy
 * notes, the story of the kitchen and its suppliers, how to book, the private
 * room, opening hours and directions, and the legal notice.
 *
 * Written in French and in English, not translated at render time (L36): the
 * installer picks the copy for the site's default locale, and with it the
 * addresses (`/carte/…` in French, `/menu/…` in English), the names of the
 * sections of the menu that a dish stores, the collection names the
 * administration shows and every word of demo content. Every photograph is a
 * real one under an open licence, credited on its own page.
 *
 * **No booking engine, and nothing that pretends to be one.** A blueprint
 * writes content; contract B has no reservation block and nothing in a page
 * can hold a table. So the site is honest about how to book: the header's
 * "Reserve" link and the home page's one action lead to a Reservations page
 * that says how it works (telephone hours, an email answered the same day,
 * the counter kept for guests without a booking, groups, deposits,
 * cancellation), and its only actions are a `tel:` link and a `mailto:` link
 * that both work on any device. A restaurant that uses an online booking
 * service puts that address in the same actions.
 *
 * The menu is a `menu_item` collection whose `category` names the section of
 * the menu; `@cogenta/theme-restaurant` reads any list of priced entries as a
 * menu and groups it by that field, in the order the entries were written
 * (the lists sort on `id`, a UUIDv7, so insertion order is the menu's order).
 */

export const DEFAULT_RESTAURANT_NAME = 'Laurier'

export type { RestaurantLocale } from './restaurant-copy.js'

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function restaurantCopyFor(locale: string): RestaurantCopy {
  return locale.toLowerCase().startsWith('fr') ? RESTAURANT_COPY_FR : RESTAURANT_COPY_EN
}

const PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  publish: ['admin'],
} as const

export interface RestaurantSchema {
  readonly menuItem: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
}

/**
 * The content model, named and routed in the copy's language. Field labels are
 * not declared here: the administration translates them from its own
 * dictionaries, and the options of `category` are the names of the sections
 * the copy prints, so a French dish is filed under "Plats", not "Mains".
 */
export function restaurantSchema(copy: RestaurantCopy): RestaurantSchema {
  const menuItem = defineCollection({
    name: 'menu_item',
    versioning: { drafts: true, history: true },
    labels: copy.schema.dishLabels,
    routing: { pattern: copy.schema.dishRoute },
    fields: {
      name: f.text({ required: true, max: 120 }),
      slug: f.slug({ from: 'name', unique: true }),
      description: f.text({ max: 300, multiline: true }),
      price: f.number({ required: true, min: 0 }),
      currency: f.select({ options: ['EUR', 'CHF', 'GBP', 'DKK', 'USD'], default: 'EUR' }),
      category: f.select({ options: [...copy.sections], required: true }),
      vegetarian: f.boolean({ default: false }),
      sourcing: f.text({ max: 200 }),
      pairing: f.text({ max: 160 }),
      allergens: f.text({ max: 200 }),
      photo: f.media({ accept: ['image'] }),
      blocks: f.blocks(),
      ...SEO_FIELDS,
    },
    indexes: [['slug'], ['category']],
    permissions: PERMISSIONS,
  })
  const page = definePageCollection('/:slug')
  const collections = [menuItem, page]
  validateCollectionSet(collections)
  return { menuItem, page, collections }
}

const ENGLISH_SCHEMA = restaurantSchema(RESTAURANT_COPY_EN)
export const menuItem = ENGLISH_SCHEMA.menuItem
export const page = ENGLISH_SCHEMA.page
export const RESTAURANT_COLLECTIONS: readonly CollectionDefinition[] = ENGLISH_SCHEMA.collections

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// The house: address, telephone, mailboxes
// ---------------------------------------------------------------------------

export const RESTAURANT_ADDRESS = '8 rue Burdeau, 69001 Lyon'
export const RESTAURANT_PHONE = '+33 4 78 28 16 42'
const PHONE_LINK = 'tel:+33478281642'
const MAP_LINK = 'https://www.openstreetmap.org/?mlat=45.7695&mlon=4.8325#map=18/45.7695/4.8325'

function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_RESTAURANT_NAME : trimmed
}

/** `table@maisonverte.fr` for "Maison Verte": the restaurant's own name, as a mailbox. */
export function restaurantEmail(siteName: string | undefined, mailbox = 'table'): string {
  const domain = nameOf(siteName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'restaurant' : domain}.fr`
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

type RichNode = RichTextDocument[number]

/**
 * A paragraph where `[words](href)` becomes a link. Nothing else is
 * interpreted: the copy stays plain text a person can read in its file.
 */
function textBlock(key: string, style: 'normal' | 'h2' | 'h3', text: string): RichNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/).filter((part) => part !== '')
  const markDefs: { _key: string; _type: 'link'; href: string }[] = []
  const children = parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link === null) {
      return { _key: `${key}-s${index}`, _type: 'span' as const, text: part, marks: [] }
    }
    const mark = `${key}-l${index}`
    markDefs.push({ _key: mark, _type: 'link', href: link[2] as string })
    return {
      _key: `${key}-s${index}`,
      _type: 'span' as const,
      text: link[1] as string,
      marks: [mark],
    }
  })
  return { _key: key, _type: 'block', style, children, markDefs }
}

/** A prose block from lines: `## ` starts a heading, anything else is a paragraph. */
function prose(
  key: string,
  lines: readonly string[],
  variant?: { readonly align: 'center' },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    ...(variant === undefined ? {} : { variant }),
    body: lines.map((line, index) =>
      line.startsWith('## ')
        ? textBlock(`${key}-${index}`, 'h2', line.slice(3))
        : textBlock(`${key}-${index}`, 'normal', line),
    ),
  } as VocabularyBlock
}

function answer(key: string, text: string): RichTextDocument {
  return [textBlock(key, 'normal', text)]
}

function questions(
  key: string,
  items: RestaurantQuestions,
): { _key: string; question: string; answer: RichTextDocument }[] {
  return items.map(([question, text], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: answer(`${key}-${index}-a`, text),
  }))
}

/** A `featureGrid` without icons, which the theme sets as a ruled table. */
function table(key: string, title: string, rows: readonly RestaurantRow[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'featureGrid',
    _version: BLOCK_VERSION,
    title,
    items: rows.map((row, index) => ({
      _key: `${key}-${index}`,
      title: row.title,
      text: row.text,
      ...(row.href === undefined ? {} : { link: { href: row.href } }),
    })),
  } as VocabularyBlock
}

function pricingTable(
  key: string,
  title: string,
  tiers: readonly RestaurantTier[],
): VocabularyBlock {
  return {
    _key: key,
    _type: 'pricingTable',
    _version: BLOCK_VERSION,
    title,
    tiers: tiers.map((tier, index) => ({
      _key: `${key}-${index}`,
      name: tier.name,
      price: tier.price,
      interval: tier.interval,
      features: [...tier.features],
      ...(tier.highlighted === true ? { highlighted: true } : {}),
    })),
  } as VocabularyBlock
}

// ---------------------------------------------------------------------------
// The menu, in the order it is printed
// ---------------------------------------------------------------------------

/** A dish of the English copy, with the name of the section it is filed under. */
export interface RestaurantDemoDish extends RestaurantDishCopy {
  readonly category: string
}

function withCategory(copy: RestaurantCopy): readonly RestaurantDemoDish[] {
  return copy.dishes.map((dish) => ({ ...dish, category: copy.sections[dish.section] }))
}

/**
 * Nineteen dishes and wines for a week in early autumn, in the order the menu
 * prints them. Ten of them have a photograph (`RESTAURANT_DISH_PHOTOS`), and
 * every photograph shows the dish it is filed under.
 */
export const RESTAURANT_DEMO_DISHES: readonly RestaurantDemoDish[] =
  withCategory(RESTAURANT_COPY_EN)

/** The photographed dishes of a copy, by slug, with what each photograph shows. */
export function restaurantDishPhotos(copy: RestaurantCopy): Readonly<Record<string, string>> {
  return Object.fromEntries(
    copy.dishes.flatMap((dish) =>
      dish.photoAlt === undefined ? [] : [[dish.slug, dish.photoAlt]],
    ),
  )
}

/** The dishes photographed for the site, by slug. Every other dish has no photograph, on purpose. */
export const RESTAURANT_DISH_PHOTOS: Readonly<Record<string, string>> =
  restaurantDishPhotos(RESTAURANT_COPY_EN)

/** The four plates that make the band of photographs on the home page. */
const HOME_PLATES = ['beetroot-carpaccio', 'grilled-octopus', 'duck-confit', 'poached-pear']

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Media = Readonly<Record<string, string>>

export interface RestaurantDemoOptions {
  readonly siteName?: string
  readonly media?: Media
  /** The words to write the pages in. Absent: English. */
  readonly copy?: RestaurantCopy
}

function menuList(
  key: string,
  options: {
    readonly title?: string
    readonly category?: string
    readonly layout?: 'grid' | 'list'
  },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    ...(options.title === undefined ? {} : { title: options.title }),
    collection: 'menu_item',
    ...(options.category === undefined ? {} : { filter: { category: options.category } }),
    sort: { field: 'id', direction: 'asc' },
    limit: 40,
    layout: options.layout ?? 'grid',
  } as VocabularyBlock
}

/** The body of one dish's page: the note from the kitchen, then the rest of its section. */
export function restaurantDishBlocks(
  dish: RestaurantDishCopy,
  copy: RestaurantCopy = RESTAURANT_COPY_EN,
): readonly VocabularyBlock[] {
  return [
    prose(`dish-${dish.id}-note`, [dish.note]),
    menuList(`dish-${dish.id}-more`, {
      title: copy.moreTitles[dish.section],
      category: copy.sections[dish.section],
      layout: 'list',
    }),
  ]
}

function pageContext(copy: RestaurantCopy, siteName: string) {
  return {
    name: siteName,
    email: (mailbox: 'table' | 'events' | 'hello') => restaurantEmail(siteName, mailbox),
    href: (key: RestaurantPageKey) => `/${copy.pageSlugs[key]}`,
    phoneHref: PHONE_LINK,
    mapHref: MAP_LINK,
  }
}

export function buildRestaurantHomeBlocks(
  options: RestaurantDemoOptions = {},
): readonly VocabularyBlock[] {
  const copy = options.copy ?? RESTAURANT_COPY_EN
  const media = options.media ?? {}
  const siteName = nameOf(options.siteName)
  const context = pageContext(copy, siteName)
  const words = copy.pages(context)
  const plates = HOME_PLATES.map((id) => media[`dish-${id}`]).filter(
    (id): id is string => id !== undefined,
  )

  return [
    {
      _key: 'home-hero',
      _type: 'hero',
      _version: BLOCK_VERSION,
      eyebrow: words.home.heroEyebrow,
      title: siteName,
      subtitle: words.home.heroSubtitle,
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [{ label: words.home.heroAction, target: { href: context.href('reservations') } }],
    } as VocabularyBlock,
    prose('home-welcome', [words.home.welcome], { align: 'center' }),
    menuList('home-menu', { title: words.home.menuTitle }),
    ...(plates.length === 0
      ? []
      : [
          {
            _key: 'home-plates',
            _type: 'gallery',
            _version: BLOCK_VERSION,
            layout: 'grid',
            items: plates.map((id, index) => ({ _key: `home-plates-${index}`, media: id })),
          } as VocabularyBlock,
        ]),
    prose('home-kitchen', words.home.kitchen),
    {
      _key: 'home-press',
      _type: 'quote',
      _version: BLOCK_VERSION,
      text: words.home.press.text,
      author: words.home.press.author,
      role: words.home.press.role,
    } as VocabularyBlock,
    table('home-hours', words.home.hoursTitle, [
      ...words.hours,
      { title: words.labels.address, text: copy.address, href: context.href('visit') },
      { title: words.labels.telephone, text: copy.phoneDisplay, href: PHONE_LINK },
    ]),
    {
      _key: 'home-private',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: words.home.privateCta.title,
      text: words.home.privateCta.text,
      actions: [
        {
          label: words.home.privateCta.action,
          target: { href: context.href('privateDining') },
        },
      ],
    } as VocabularyBlock,
    {
      _key: 'home-book',
      _type: 'cta',
      _version: BLOCK_VERSION,
      variant: { background: 'muted' },
      title: words.home.bookCta.title,
      text: words.home.bookCta.text,
      actions: reservationActions(words, siteName),
    } as VocabularyBlock,
  ]
}

function reservationActions(words: ReturnType<RestaurantCopy['pages']>, siteName: string) {
  return [
    { label: words.actions.call, target: { href: PHONE_LINK }, emphasis: 'primary' },
    {
      label: words.actions.write,
      target: {
        href: `mailto:${restaurantEmail(siteName)}?subject=${encodeURIComponent(words.actions.tableSubject)}`,
      },
    },
  ]
}

export interface RestaurantDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/** A prose block that lists the photographs, each credited with its author, licence and source. */
function creditsBlock(
  key: string,
  intro: readonly string[],
  sourceWord: string,
  credits: readonly PhotoCredit[],
): VocabularyBlock {
  const paragraphs = intro.map((line, index) => textBlock(`${key}-${index}`, 'normal', line))
  const items: RichNode[] = credits.map((credit, index) => {
    const itemKey = `${key}-credit-${index}`
    const links: { _key: string; _type: 'link'; href: string }[] = []
    const children: {
      _key: string
      _type: 'span'
      text: string
      marks: string[]
    }[] = []
    const add = (text: string, href?: string): void => {
      const spanKey = `${itemKey}-s${children.length}`
      if (href === undefined) {
        children.push({ _key: spanKey, _type: 'span', text, marks: [] })
        return
      }
      const markKey = `${itemKey}-l${links.length}`
      links.push({ _key: markKey, _type: 'link', href })
      children.push({ _key: spanKey, _type: 'span', text, marks: [markKey] })
    }
    add(`${credit.title} · ${credit.author} · `)
    add(credit.licence.replaceAll(' ', '\u00A0'), credit.licenceUrl)
    add(' ·\u00A0')
    add(sourceWord, credit.source)
    return {
      _key: itemKey,
      _type: 'block',
      style: 'normal',
      listItem: 'bullet',
      level: 1,
      children,
      markDefs: links,
    } as RichNode
  })
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: [...paragraphs, ...items],
  } as VocabularyBlock
}

/**
 * `home`, the menu, the story, reservations, private dining, hours and
 * address, the legal notice and the photo credits: every page the menus and
 * the copy link to, in the copy's language.
 */
export function buildRestaurantDemoPages(
  options: RestaurantDemoOptions = {},
): readonly RestaurantDemoPage[] {
  const copy = options.copy ?? RESTAURANT_COPY_EN
  const media = options.media ?? {}
  const siteName = nameOf(options.siteName)
  const context = pageContext(copy, siteName)
  const words = copy.pages(context)
  const slugs = copy.pageSlugs
  const events = restaurantEmail(siteName, 'events')

  const figure = (
    key: string,
    name: string,
    caption: string,
    align: 'start' | 'wide',
  ): readonly VocabularyBlock[] =>
    media[name] === undefined
      ? []
      : [
          {
            _key: key,
            _type: 'mediaFigure',
            _version: BLOCK_VERSION,
            media: media[name],
            ratio: '3:2',
            align,
            caption,
          } as VocabularyBlock,
        ]

  return [
    {
      title: words.titles.home,
      slug: slugs.home,
      blocks: buildRestaurantHomeBlocks({ siteName, media, copy }),
    },
    {
      title: words.titles.menu,
      slug: slugs.menu,
      blocks: [
        prose('menu-intro', [words.menu.intro]),
        pricingTable('menu-sets', words.menu.setsTitle, words.menu.tiers),
        menuList('menu-all', { title: words.menu.listTitle }),
        {
          _key: 'menu-notes',
          _type: 'accordion',
          _version: BLOCK_VERSION,
          title: words.menu.notesTitle,
          items: questions('menu-notes', words.menu.notes),
        } as VocabularyBlock,
      ],
    },
    {
      title: words.titles.story,
      slug: slugs.story,
      blocks: [
        prose('story-intro', words.story.intro),
        ...figure('story-room', 'hero', words.story.roomCaption, 'start'),
        {
          _key: 'story-figures',
          _type: 'stats',
          _version: BLOCK_VERSION,
          title: words.story.figuresTitle,
          items: words.story.figures.map((item, index) => ({
            _key: `story-figures-${index}`,
            value: item.value,
            ...(item.unit === undefined ? {} : { unit: item.unit }),
            label: item.label,
          })),
        } as VocabularyBlock,
        table('story-suppliers', words.story.suppliersTitle, words.story.suppliers),
        ...figure('story-market', 'market', words.story.marketCaption, 'start'),
      ],
    },
    {
      title: words.titles.reservations,
      slug: slugs.reservations,
      blocks: [
        prose('reservations-intro', words.reservations.intro),
        table('reservations-summary', words.reservations.summaryTitle, words.reservations.summary),
        {
          _key: 'reservations-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: words.reservations.faqTitle,
          items: questions('reservations-faq', words.reservations.faq),
        } as VocabularyBlock,
        {
          _key: 'reservations-book',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: words.reservations.cta.title,
          text: words.reservations.cta.text,
          actions: reservationActions(words, siteName),
        } as VocabularyBlock,
      ],
    },
    {
      title: words.titles.privateDining,
      slug: slugs.privateDining,
      blocks: [
        prose('private-intro', words.privateDining.intro),
        pricingTable('private-menus', words.privateDining.menusTitle, words.privateDining.tiers),
        {
          _key: 'private-note',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: answer('private-note-quote', words.privateDining.testimonial.quote),
          attribution: {
            name: words.privateDining.testimonial.name,
            role: words.privateDining.testimonial.role,
          },
        } as VocabularyBlock,
        {
          _key: 'private-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: words.privateDining.faqTitle,
          items: questions('private-faq', words.privateDining.faq),
        } as VocabularyBlock,
        {
          _key: 'private-plan',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: words.privateDining.cta.title,
          text: words.privateDining.cta.text,
          actions: [
            {
              label: words.actions.write,
              target: {
                href: `mailto:${events}?subject=${encodeURIComponent(words.actions.eventsSubject)}`,
              },
              emphasis: 'primary',
            },
            { label: words.actions.call, target: { href: PHONE_LINK } },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: words.titles.visit,
      slug: slugs.visit,
      blocks: [
        table('visit-hours', words.visit.hoursTitle, [...words.hours, ...words.visit.extraHours]),
        table('visit-access', words.visit.accessTitle, words.visit.access),
        ...figure('visit-street', 'street', words.visit.streetCaption, 'wide'),
        prose('visit-note', [words.visit.note]),
      ],
    },
    {
      title: words.titles.legal,
      slug: slugs.legal,
      blocks: [prose('legal-body', words.legal)],
    },
    {
      title: words.titles.credits,
      slug: slugs.credits,
      blocks: [
        creditsBlock(
          'credits-body',
          words.credits.intro,
          words.credits.sourceWord,
          RESTAURANT_PHOTO_CREDITS,
        ),
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Media, menus, settings
// ---------------------------------------------------------------------------

/**
 * `restaurant`'s own starting skin, asserted present with a real check since
 * `STARTING_SKINS` is keyed by blueprint id. Its palette only feeds the
 * procedural fallback of each media slot below, which is never used while the
 * photographs are bundled.
 */
function restaurantPalette(): Palette {
  const skin = STARTING_SKINS.restaurant
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.restaurant is missing.',
      hint: 'The "restaurant" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

/**
 * Every visual this blueprint seeds is a bundled photograph: the dining room,
 * the street, a market stall, and one photograph for each of the ten dishes
 * that has one, every dish cropped to the same 4:5. The home page's band of
 * plates and the story page's figure reuse these, never a second copy. `spec`
 * is `seedDemoMedia`'s fallback if a file is ever missing, never the intended
 * picture.
 */
export function restaurantMediaSpecs(copy: RestaurantCopy): readonly DemoMediaSpec[] {
  const palette = restaurantPalette()
  const dishes = copy.dishes.flatMap((dish, index): DemoMediaSpec[] =>
    dish.photoAlt === undefined
      ? []
      : [
          {
            name: `dish-${dish.id}`,
            spec: coverArt(palette, 100 + index),
            alt: dish.photoAlt,
            photo: `restaurant/${dish.id}.jpg`,
          },
        ],
  )
  return [
    {
      name: 'hero',
      spec: heroArt(palette, 'radial', 7),
      alt: copy.media.hero,
      photo: 'restaurant/hero.jpg',
    },
    ...dishes,
    {
      name: 'street',
      spec: coverArt(palette, 140),
      alt: copy.media.street,
      photo: 'restaurant/street-burdeau.jpg',
    },
    {
      name: 'market',
      spec: coverArt(palette, 141),
      alt: copy.media.market,
      photo: 'restaurant/market-stall.jpg',
    },
  ]
}

export const RESTAURANT_MEDIA_SPECS: readonly DemoMediaSpec[] =
  restaurantMediaSpecs(RESTAURANT_COPY_EN)

export function restaurantMenus(copy: RestaurantCopy): BlueprintMenus {
  const url = (key: RestaurantPageKey): string => `/${copy.pageSlugs[key]}`
  return {
    header: copy.menus.header.map((item) => ({ label: item.label, url: url(item.page) })),
    footer: copy.menus.footer.map((item) => ({ label: item.label, url: url(item.page) })),
    headerAction: { label: copy.menus.action.label, url: url(copy.menus.action.page) },
  }
}

export const RESTAURANT_MENUS: BlueprintMenus = restaurantMenus(RESTAURANT_COPY_EN)

/**
 * The widgets a restaurant's site places, and where.
 *
 * Beside a dish (which opens on its own photograph and words, not a hero) and
 * beside search results: the way to book, in the house's words, then a
 * critic's line about the kitchen. Never beside the menu, the set menus or
 * the room upstairs: those pages lay out their prices across the whole grid.
 *
 * In the footer, under the address card it already prints (street,
 * telephone, lunch and dinner hours), a second tier with what that card
 * leaves out: the days the restaurant is closed, the counter kept for guests
 * without a booking and the hours the telephone is answered; then the room
 * upstairs. Neither shows on a page that already says the same thing: the home
 * page (its own hours table and its private dining band), the hours page, the
 * reservations page and the private dining page.
 *
 * No widget names the restaurant's e-mail address: the pages derive it from
 * the site's name, and a widget's settings cannot, so it would contradict them
 * on any site not called Laurier.
 */
type RestaurantPageTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'collection'; readonly collection: 'menu_item' }
  | { readonly kind: 'search' }
  | { readonly kind: 'path'; readonly path: string }

const DISH_PAGE: RestaurantPageTarget = { kind: 'collection', collection: 'menu_item' }
const SEARCH_RESULTS: RestaurantPageTarget = { kind: 'search' }
const HOME: RestaurantPageTarget = { kind: 'home' }
const pagePath = (path: string): RestaurantPageTarget => ({ kind: 'path', path })

function shownOn(
  mode: 'only' | 'except',
  ...targets: readonly RestaurantPageTarget[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode, targets } }
}

export function restaurantWidgets(copy: RestaurantCopy): readonly BlueprintWidget[] {
  const w = copy.widgets
  const path = (key: RestaurantPageKey): string => `/${copy.pageSlugs[key]}`
  const press = copy.pages({
    name: DEFAULT_RESTAURANT_NAME,
    email: () => '',
    href: path,
    phoneHref: PHONE_LINK,
    mapHref: MAP_LINK,
  }).home.press
  return [
    {
      area: 'sidebar',
      type: 'cta',
      title: w.reservations.title,
      settings: {
        heading: w.reservations.heading,
        body: w.reservations.body,
        label: w.reservations.label,
        href: path('reservations'),
      },
      visibility: shownOn('only', DISH_PAGE, SEARCH_RESULTS),
    },
    {
      area: 'sidebar',
      type: 'quote',
      settings: { text: press.text, attribution: press.author, role: press.role },
      visibility: shownOn('only', DISH_PAGE),
    },
    {
      area: 'footer-1',
      type: 'contact',
      title: w.goodToKnow.title,
      settings: { hours: w.goodToKnow.hours.map((row) => ({ ...row })) },
      visibility: shownOn('except', HOME, pagePath(path('visit')), pagePath(path('reservations'))),
    },
    {
      area: 'footer-2',
      type: 'cta',
      title: w.privateDining.title,
      settings: {
        heading: w.privateDining.heading,
        body: w.privateDining.body,
        label: w.privateDining.label,
        href: path('privateDining'),
      },
      visibility: shownOn('except', HOME, pagePath(path('privateDining'))),
    },
  ]
}

export const RESTAURANT_WIDGETS: readonly BlueprintWidget[] = restaurantWidgets(RESTAURANT_COPY_EN)

export function restaurantSiteSettings(copy: RestaurantCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.settings.tagline,
    'general.socialLinks': [
      { label: 'Instagram', url: 'https://instagram.com/example' },
      { label: 'Facebook', url: 'https://facebook.com/example' },
    ],
    'general.footerNote': copy.settings.footerNote,
    // A menu is not a discussion: no comment form under a dish. An editor can
    // open comments again per collection or per entry.
    'discussion.enabled': false,
  }
}

export const RESTAURANT_SITE_SETTINGS: Readonly<Record<string, unknown>> =
  restaurantSiteSettings(RESTAURANT_COPY_EN)

export const RESTAURANT_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits the menu and the hours page so the restaurant is findable by name, street and cuisine.',
  },
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized food photography before it slows the menu page down.',
  },
]

/**
 * Inserts the blueprint's content through the real `ContentStore`, never
 * mocked (house rule): the dishes first, in the order the menu prints them,
 * then the pages. Everything is published, so every list and every link has
 * something real behind it.
 */
function seedRestaurantDemoContent(copy: RestaurantCopy) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media } = ctx
    const siteName = nameOf(ctx.siteName)
    const model = restaurantSchema(copy)
    const dishStore = createContentStore({ db, collection: model.menuItem, defaultLocale })
    const pageStore = createContentStore({ db, collection: model.page, defaultLocale })

    for (const dish of copy.dishes) {
      const photo = media[`dish-${dish.id}`]
      await dishStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          name: dish.name,
          slug: dish.slug,
          description: dish.description,
          price: dish.price,
          currency: 'EUR',
          category: copy.sections[dish.section],
          vegetarian: dish.vegetarian,
          sourcing: dish.sourcing,
          ...(dish.pairing === undefined ? {} : { pairing: dish.pairing }),
          ...(dish.allergens === undefined ? {} : { allergens: dish.allergens }),
          ...(photo === undefined ? {} : { photo }),
        },
        blocks: { blocks: restaurantDishBlocks(dish, copy).map(toBlockZoneEntry) },
      })
    }

    for (const demo of buildRestaurantDemoPages({ siteName, media, copy })) {
      await pageStore.create({
        status: 'published',
        createdBy: adminId,
        values: { title: demo.title, slug: demo.slug },
        blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
      })
    }
  }
}

/** The whole blueprint, in one language. */
export function createRestaurantContentPack(locale: string): BlueprintContentPack {
  const copy = restaurantCopyFor(locale)
  return {
    collections: restaurantSchema(copy).collections,
    recommendedAgents: RESTAURANT_RECOMMENDED_AGENTS,
    seedDemoContent: seedRestaurantDemoContent(copy),
    defaultTheme: '@cogenta/theme-restaurant',
    menus: restaurantMenus(copy),
    widgets: restaurantWidgets(copy),
    siteSettings: restaurantSiteSettings(copy),
    mediaSpecs: restaurantMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const restaurantContentPack: BlueprintContentPack = createRestaurantContentPack('en')
