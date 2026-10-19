import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, heroArt, type Palette, productArt } from '../demo-art/compositions.js'
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
import { STARTING_SKINS } from './starting-skins.js'
import type {
  StoreCategoryCopy,
  StoreCopy,
  StoreFacts,
  StoreLines,
  StorePageKey,
  StoreProductCopy,
  StoreQuestions,
} from './store-copy.js'
import { STORE_COPY_EN } from './store-copy-en.js'
import { STORE_COPY_FR } from './store-copy-fr.js'
import { STORE_PHOTO_CREDITS } from './store-credits.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `store` blueprint (L27, `@cogenta/theme-ecommerce`): a small shop in
 * Lyon of durable everyday goods with a repair bench behind the counter,
 * twelve products from the workshops it buys from, three departments, and the
 * pages a real shop needs before it takes an order (how to order, delivery and
 * returns, repairs, contact, terms).
 *
 * Written in French and in English, not translated at render time: the
 * installer picks the copy for the site's default locale, and with it the
 * addresses (`/boutique/…` in French, `/shop/…` in English), the names the
 * administration shows and every word of demo content. Every photograph is a
 * real one under an open licence, credited on its own page.
 *
 * **Contract A only, and no checkout.** A blueprint writes
 * `cogenta.schema.mjs` and seeds content; it cannot provision
 * `@cogenta/commerce`'s tables (contract E, ADR-0024), and contract B has no
 * cart or checkout block. So the catalogue is honest about how to buy: each
 * product names where it can be ordered (`orderLink`, an email to the shop
 * with the product in the subject line), the theme turns that into an
 * "Order by email" action, and the "How to order" page says what happens
 * next. A shop that connects a payment link or a marketplace page puts that
 * address in the same field.
 *
 * Categories are a small collection of their own rather than a taxonomy: a
 * category page here is a photographed grid of goods, and a term archive
 * (`TermArchiveEntry`) carries neither a picture nor a price. Each product
 * keeps its category as a plain `select`, which is what a category's own
 * list filters on and what the product page prints.
 */

export const DEFAULT_SHOP_NAME = 'Atelier Goods'

export type {
  StoreCategoryCopy as StoreDemoCategory,
  StoreLocale,
  StoreProductCopy as StoreDemoProduct,
} from './store-copy.js'

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function storeCopyFor(locale: string): StoreCopy {
  return locale.toLowerCase().startsWith('fr') ? STORE_COPY_FR : STORE_COPY_EN
}

const CURRENCIES = ['EUR', 'GBP', 'CHF', 'DKK', 'SEK', 'USD'] as const

const PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  publish: ['admin'],
} as const

export interface StoreSchema {
  readonly product: CollectionDefinition
  readonly category: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
}

/** The content model, named and routed in the copy's language. */
export function storeSchema(copy: StoreCopy): StoreSchema {
  const product = defineCollection({
    name: 'product',
    versioning: { drafts: true, history: true },
    labels: copy.schema.labels.product,
    routing: { pattern: copy.schema.routes.product },
    fields: {
      name: f.text({ required: true, max: 120 }),
      slug: f.slug({ from: 'name', unique: true }),
      description: f.text({ max: 300, multiline: true }),
      price: f.number({ required: true, min: 0 }),
      currency: f.select({ options: [...CURRENCIES], default: 'EUR' }),
      category: f.select({
        options: copy.categories.map((entry) => entry.name),
        required: true,
      }),
      inStock: f.boolean({ default: true }),
      material: f.text({ max: 200 }),
      dimensions: f.text({ max: 200 }),
      weight: f.text({ max: 60 }),
      capacity: f.text({ max: 60 }),
      origin: f.text({ max: 160 }),
      care: f.text({ max: 300, multiline: true }),
      delivery: f.text({ max: 300, multiline: true }),
      orderLink: f.text({ max: 400 }),
      photo: f.media({ accept: ['image'] }),
      blocks: f.blocks(),
      ...SEO_FIELDS,
    },
    indexes: [['slug'], ['category']],
    permissions: PERMISSIONS,
  })

  const category = defineCollection({
    name: 'category',
    versioning: { drafts: true, history: true },
    labels: copy.schema.labels.category,
    routing: { pattern: copy.schema.routes.category },
    fields: {
      name: f.text({ required: true, max: 80 }),
      slug: f.slug({ from: 'name', unique: true }),
      summary: f.text({ max: 240, multiline: true }),
      photo: f.media({ accept: ['image'] }),
      blocks: f.blocks(),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: PERMISSIONS,
  })

  const page = definePageCollection('/:slug')
  const collections = [product, category, page]
  validateCollectionSet(collections)
  return { product, category, page, collections }
}

const ENGLISH_SCHEMA = storeSchema(STORE_COPY_EN)

export const product = ENGLISH_SCHEMA.product
export const category = ENGLISH_SCHEMA.category
export const page = ENGLISH_SCHEMA.page
export const STORE_COLLECTIONS: readonly CollectionDefinition[] = ENGLISH_SCHEMA.collections

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/** `orders@ateliergoods.com` for "Atelier Goods": the shop's own name, as a mailbox. */
export function shopEmail(siteName: string, mailbox = 'hello'): string {
  const domain = siteName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'shop' : domain}.com`
}

function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_SHOP_NAME : trimmed
}

function factsOf(siteName: string | undefined): StoreFacts {
  const name = nameOf(siteName)
  return {
    name,
    hello: shopEmail(name),
    orders: shopEmail(name, 'orders'),
    repairs: shopEmail(name, 'repairs'),
    letters: shopEmail(name, 'letters'),
  }
}

type RichNode = RichTextDocument[number]

/**
 * A paragraph where `[words](href)` becomes a link. Nothing else is
 * interpreted: the copy stays plain text a person can read in this file.
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
function prose(key: string, lines: StoreLines): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
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
  items: StoreQuestions,
): { _key: string; question: string; answer: RichTextDocument }[] {
  return items.map(([question, text], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: answer(`${key}-${index}-a`, text),
  }))
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Media = Readonly<Record<string, string>>

export interface StoreDemoOptions {
  readonly siteName?: string
  readonly media?: Media
  /** The site's default locale: a `fr` locale picks the French copy. */
  readonly locale?: string
}

function categoryOf(copy: StoreCopy, id: StoreProductCopy['category']): StoreCategoryCopy {
  const found = copy.categories.find((entry) => entry.id === id)
  if (found === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: `The store copy names no "${id}" category.`,
      hint: 'Every product of the store copy must name one of its categories.',
    })
  }
  return found
}

function productsGrid(
  key: string,
  options: { readonly title?: string; readonly category?: string; readonly limit: number },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    ...(options.title === undefined ? {} : { title: options.title }),
    collection: 'product',
    ...(options.category === undefined ? {} : { filter: { category: options.category } }),
    sort: { field: 'createdAt', direction: 'desc' },
    limit: options.limit,
    layout: 'grid',
  } as VocabularyBlock
}

function commitments(copy: StoreCopy, facts: StoreFacts, key: string): VocabularyBlock {
  const words = copy.pages(facts).home
  return {
    _key: key,
    _type: 'featureGrid',
    _version: BLOCK_VERSION,
    items: words.commitments.map((item, index) => ({
      _key: `${key}-${index}`,
      title: item.title,
      link: { href: `/${copy.pageSlugs[item.page]}` },
    })),
  } as VocabularyBlock
}

/** The body of one product's page: how it is made, then more from its category. */
export function storeProductBlocks(
  copy: StoreCopy,
  demo: StoreProductCopy,
): readonly VocabularyBlock[] {
  const group = categoryOf(copy, demo.category)
  return [
    prose(`product-${demo.slug}-story`, [...demo.story]),
    productsGrid(`product-${demo.slug}-more`, {
      title: group.relatedTitle,
      category: group.name,
      limit: 5,
    }),
  ]
}

/** The body of a category's page: its goods, then the people who make them. */
export function storeCategoryBlocks(demo: StoreCategoryCopy): readonly VocabularyBlock[] {
  return [
    productsGrid(`category-${demo.slug}-goods`, { category: demo.name, limit: 24 }),
    prose(`category-${demo.slug}-makers`, [...demo.makers]),
  ]
}

export function buildStoreHomeBlocks(options: StoreDemoOptions = {}): readonly VocabularyBlock[] {
  const copy = storeCopyFor(options.locale ?? 'en')
  const media = options.media ?? {}
  const facts = factsOf(options.siteName)
  const words = copy.pages(facts).home
  return [
    {
      _key: 'home-banner',
      _type: 'hero',
      _version: BLOCK_VERSION,
      title: words.heroTitle,
      subtitle: words.heroSubtitle,
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [
        {
          label: words.heroAction,
          target: { href: `/${copy.pageSlugs.shop}` },
          emphasis: 'primary',
        },
      ],
    } as VocabularyBlock,
    {
      _key: 'home-categories',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      collection: 'category',
      sort: { field: 'createdAt', direction: 'asc' },
      limit: 4,
      layout: 'grid',
    } as VocabularyBlock,
    productsGrid('home-new', { title: words.newTitle, limit: 4 }),
    commitments(copy, facts, 'home-commitments'),
    ...(media.story === undefined
      ? []
      : [
          {
            _key: 'home-story',
            _type: 'mediaFigure',
            _version: BLOCK_VERSION,
            media: media.story,
            ratio: '4:3',
            align: 'start',
            caption: words.storyCaption,
          } as VocabularyBlock,
        ]),
    {
      _key: 'home-letter',
      _type: 'testimonial',
      _version: BLOCK_VERSION,
      quote: answer('home-letter-quote', words.letter.quote),
      attribution: { name: words.letter.name, role: words.letter.role },
    } as VocabularyBlock,
    {
      _key: 'home-faq',
      _type: 'faq',
      _version: BLOCK_VERSION,
      title: words.faqTitle,
      items: questions('home-faq', words.faq),
    } as VocabularyBlock,
    {
      _key: 'home-letters',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: words.lettersTitle,
      text: words.lettersText,
      actions: [
        {
          label: words.lettersAction,
          target: {
            href: `mailto:${facts.letters}?subject=${encodeURIComponent(words.lettersSubject)}`,
          },
          emphasis: 'secondary',
        },
      ],
    } as VocabularyBlock,
  ]
}

export interface StoreDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home`, `shop` (every product), `about`, how to order, delivery and
 * returns, repairs, contact, terms and the photo credits: every page the
 * menus and the copy link to, in the copy's language.
 */
export function buildStoreDemoPages(options: StoreDemoOptions = {}): readonly StoreDemoPage[] {
  const copy = storeCopyFor(options.locale ?? 'en')
  const media = options.media ?? {}
  const facts = factsOf(options.siteName)
  const words = copy.pages(facts)
  const slug = copy.pageSlugs

  const entry = (key: StorePageKey, blocks: readonly VocabularyBlock[]): StoreDemoPage => ({
    title: words.titles[key],
    slug: slug[key],
    blocks,
  })

  return [
    entry('home', buildStoreHomeBlocks(options)),
    entry('shop', [
      productsGrid('shop-all', { limit: 48 }),
      commitments(copy, facts, 'shop-commitments'),
    ]),
    entry('about', [
      prose('about-intro', words.about.intro),
      ...(media.hero === undefined
        ? []
        : [
            {
              _key: 'about-figure',
              _type: 'mediaFigure',
              _version: BLOCK_VERSION,
              media: media.hero,
              ratio: '21:9',
              align: 'wide',
              caption: words.about.figureCaption,
            } as VocabularyBlock,
          ]),
      {
        _key: 'about-figures',
        _type: 'stats',
        _version: BLOCK_VERSION,
        title: words.about.figuresTitle,
        items: words.about.figures.map((item, index) => ({
          _key: `about-figure-${index}`,
          ...item,
        })),
      } as VocabularyBlock,
      {
        _key: 'about-visit',
        _type: 'cta',
        _version: BLOCK_VERSION,
        title: words.about.visitTitle,
        text: words.about.visitText,
        actions: [
          {
            label: words.about.visitAction,
            target: { href: `/${slug.contact}` },
            emphasis: 'secondary',
          },
        ],
      } as VocabularyBlock,
    ]),
    entry('order', [
      prose('order-intro', words.order.intro),
      {
        _key: 'order-notes',
        _type: 'accordion',
        _version: BLOCK_VERSION,
        title: words.order.notesTitle,
        items: questions('order-notes', words.order.notes),
      } as VocabularyBlock,
    ]),
    entry('delivery', [
      prose('delivery-intro', words.delivery.intro),
      {
        _key: 'delivery-faq',
        _type: 'faq',
        _version: BLOCK_VERSION,
        title: words.delivery.faqTitle,
        items: questions('delivery-faq', words.delivery.faq),
      } as VocabularyBlock,
    ]),
    entry('repairs', [
      prose('repairs-intro', words.repairs.intro),
      {
        _key: 'repairs-figures',
        _type: 'statCounter',
        _version: BLOCK_VERSION,
        title: words.repairs.figuresTitle,
        stats: words.repairs.figures.map((item, index) => ({
          _key: `repairs-figure-${index}`,
          ...item,
        })),
      } as VocabularyBlock,
    ]),
    entry('contact', [prose('contact-details', words.contact)]),
    entry('terms', [prose('terms', words.terms)]),
    entry('credits', [creditsProse(words.credits, STORE_PHOTO_CREDITS)]),
  ]
}

/** The credits page's body: a sentence, then one line per photograph with its licence and source. */
function creditsProse(
  credits: { readonly intro: StoreLines; readonly sourceWord: string },
  list: readonly PhotoCredit[],
): VocabularyBlock {
  const lines = (credit: PhotoCredit, index: number): RichNode => {
    const key = `credits-item-${index}`
    const link = (part: string, text: string, href: string) => ({
      span: { _key: `${key}-s${part}`, _type: 'span' as const, text, marks: [`${key}-l${part}`] },
      mark: { _key: `${key}-l${part}`, _type: 'link' as const, href },
    })
    const plain = (part: string, text: string) => ({
      span: { _key: `${key}-s${part}`, _type: 'span' as const, text, marks: [] },
      mark: undefined,
    })
    const parts = [
      plain('0', `${credit.title} · ${credit.author} · `),
      credit.licenceUrl === undefined
        ? plain('1', credit.licence)
        : link('1', credit.licence, credit.licenceUrl),
      plain('2', ' · '),
      link('3', credits.sourceWord, credit.source),
    ]
    return {
      _key: key,
      _type: 'block',
      style: 'normal',
      listItem: 'bullet',
      level: 1,
      children: parts.map((part) => part.span),
      markDefs: parts.flatMap((part) => (part.mark === undefined ? [] : [part.mark])),
    }
  }
  return {
    _key: 'credits-body',
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: [
      ...credits.intro.map((line, index) => textBlock(`credits-intro-${index}`, 'normal', line)),
      ...list.map(lines),
    ],
  } as VocabularyBlock
}

// ---------------------------------------------------------------------------
// Media, menus, settings
// ---------------------------------------------------------------------------

/**
 * `store`'s own starting skin, asserted present with a real check since
 * `STARTING_SKINS` is keyed by blueprint id. Its palette only feeds the
 * procedural fallback of each media slot below, which is never used while
 * the photographs are bundled.
 */
function storePalette(): Palette {
  const skin = STARTING_SKINS.store
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.store is missing.',
      hint: 'The "store" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

/**
 * Every visual this blueprint seeds is a bundled photograph: the banner, one
 * per product, one per category (the photograph of a product from that
 * category that is not on the home page's grid) and the brand story's.
 * `spec` is `seedDemoMedia`'s fallback if a file is ever missing, never the
 * intended picture.
 */
export function storeMediaSpecs(copy: StoreCopy): readonly DemoMediaSpec[] {
  const palette = storePalette()
  const altOf = (key: string): string => copy.products.find((demo) => demo.key === key)?.alt ?? key
  return [
    {
      name: 'hero',
      spec: heroArt(palette, 'blocks', 11),
      alt: copy.media.hero,
      photo: 'store/hero.jpg',
    },
    ...copy.categories.map(
      (demo, index): DemoMediaSpec => ({
        name: `category-${demo.id}`,
        spec: coverArt(palette, 50 + index),
        alt: altOf(demo.photoOf),
        photo: `store/${demo.photoOf}.jpg`,
      }),
    ),
    {
      name: 'story',
      spec: coverArt(palette, 60),
      alt: copy.media.story,
      photo: 'store/story.jpg',
    },
    ...copy.products.map(
      (demo, index): DemoMediaSpec => ({
        name: `product-${demo.key}`,
        spec: productArt(palette, index + 1),
        alt: demo.alt,
        photo: `store/${demo.key}.jpg`,
      }),
    ),
  ]
}

export function storeMenus(copy: StoreCopy): BlueprintMenus {
  const url = (key: StorePageKey): string => `/${copy.pageSlugs[key]}`
  return {
    header: [
      { label: copy.menus.shop, url: url('shop') },
      ...copy.categories.map((demo) => ({
        label: demo.name,
        url: `${copy.schema.routes.category.replace('/:slug', '')}/${demo.slug}`,
      })),
      { label: copy.menus.about, url: url('about') },
    ],
    footer: copy.menus.footer.map((item) => ({ label: item.label, url: url(item.page) })),
    headerAction: { label: copy.menus.action, url: url('order') },
  }
}

/**
 * The widgets a shop's site places, and where.
 *
 * A product page stays a product page: its photograph and its sheet, then
 * the story of the piece and a grid of more from its category, which the
 * product's own blocks already draw. So no side column beside a product and
 * no "you may also like" strip under it; the same for a category (a grid of
 * goods across the page), the shop, the home page and "About", which lay
 * their photographs across the whole grid.
 *
 * Beside the pages a customer reads before and after an order (how to order,
 * delivery and returns, repairs, contact, terms): the customer care pages as
 * a ruled list with the page being read marked, and, on every one of them
 * except the contact page itself, a line pointing to that page. Beside search
 * results: the newest pieces with their photographs, so a search that finds
 * nothing still leads somewhere, then the same customer care pages.
 *
 * In the footer, what its three columns do not already say: the shop's
 * telephone (the footer note gives the address and the opening hours, never
 * the number), and the letters from the workshop, which only the home page
 * mentions. Neither shows on the page that already says the same: the contact
 * page for both, the home page for the letters.
 *
 * No widget names an e-mail address: the pages derive every address from the
 * site's name, and a widget's settings cannot, so it would contradict them on
 * any shop not called Atelier Goods.
 */
type StorePageTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'search' }
  | { readonly kind: 'path'; readonly path: string }

const HOME: StorePageTarget = { kind: 'home' }
const SEARCH_RESULTS: StorePageTarget = { kind: 'search' }
const pagePath = (path: string): StorePageTarget => ({ kind: 'path', path })

function shownOn(
  mode: 'only' | 'except',
  ...targets: readonly StorePageTarget[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode, targets } }
}

export function storeWidgets(copy: StoreCopy): readonly BlueprintWidget[] {
  const w = copy.widgets
  const slug = copy.pageSlugs
  const care = (['order', 'delivery', 'repairs', 'contact', 'terms'] as const).map((key) => ({
    label: w.careLabels[key],
    href: `/${slug[key]}`,
  }))
  const contactHref = `/${slug.contact}`

  return [
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.newTitle,
      settings: { collection: 'product', count: 4, showDate: false, showImage: true },
      visibility: shownOn('only', SEARCH_RESULTS),
    },
    {
      area: 'sidebar',
      type: 'links',
      title: w.careTitle,
      settings: { items: care.map((item) => ({ ...item })) },
      visibility: shownOn('only', ...care.map((item) => pagePath(item.href)), SEARCH_RESULTS),
    },
    {
      area: 'sidebar',
      type: 'cta',
      title: w.beforeTitle,
      settings: {
        heading: w.beforeHeading,
        body: w.beforeBody,
        label: w.beforeLabel,
        href: contactHref,
      },
      visibility: shownOn(
        'only',
        ...care.filter((item) => item.href !== contactHref).map((item) => pagePath(item.href)),
      ),
    },
    {
      area: 'footer-1',
      type: 'contact',
      title: w.phoneTitle,
      settings: {
        phone: w.phone,
        hours: [{ label: w.phoneHoursLabel, value: w.phoneHoursValue }],
      },
      visibility: shownOn('except', pagePath(contactHref)),
    },
    {
      area: 'footer-2',
      type: 'cta',
      title: w.lettersTitle,
      settings: {
        heading: w.lettersHeading,
        body: w.lettersBody,
        label: w.lettersLabel,
        href: contactHref,
      },
      visibility: shownOn('except', HOME, pagePath(contactHref)),
    },
  ]
}

export function storeSiteSettings(copy: StoreCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.settings.tagline,
    'general.socialLinks': [
      { label: 'Instagram', url: 'https://instagram.com/example' },
      { label: 'Pinterest', url: 'https://pinterest.com/example' },
    ],
    'general.footerNote': copy.settings.footerNote,
    // A catalogue is not a discussion: no comment form under a product. An
    // editor can open comments again per collection or per entry.
    'discussion.enabled': false,
  }
}

export const STORE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized product photography before it slows the shop grid down.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits product pages so each one is findable by name, not only from the grid.',
  },
]

/** The email address a product's order button writes to, with the product in the subject line. */
export function orderLinkFor(
  siteName: string | undefined,
  productName: string,
  locale = 'en',
): string {
  const subject = storeCopyFor(locale).orderSubject.replace('{product}', productName)
  return `mailto:${shopEmail(nameOf(siteName), 'orders')}?subject=${encodeURIComponent(subject)}`
}

// Kept for the blueprints that still list a single, English set of constants.
export const STORE_DEMO_PRODUCTS = STORE_COPY_EN.products
export const STORE_DEMO_CATEGORIES = STORE_COPY_EN.categories
export const STORE_MEDIA_SPECS = storeMediaSpecs(STORE_COPY_EN)
export const STORE_MENUS = storeMenus(STORE_COPY_EN)
export const STORE_WIDGETS = storeWidgets(STORE_COPY_EN)
export const STORE_SITE_SETTINGS = storeSiteSettings(STORE_COPY_EN)

/**
 * Inserts the blueprint's content through the real `ContentStore`, never
 * mocked (house rule): categories first (the home page lists them in that
 * order), then the products oldest first, then the pages. Everything is
 * published, so every list and every link has something real behind it.
 */
function seedStoreDemoContent(copy: StoreCopy) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media } = ctx
    const siteName = nameOf(ctx.siteName)
    const model = storeSchema(copy)
    const categoryStore = createContentStore({ db, collection: model.category, defaultLocale })
    const productStore = createContentStore({ db, collection: model.product, defaultLocale })
    const pageStore = createContentStore({ db, collection: model.page, defaultLocale })

    for (const demo of copy.categories) {
      const photo = media[`category-${demo.id}`]
      await categoryStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          name: demo.name,
          slug: demo.slug,
          summary: demo.summary,
          ...(photo === undefined ? {} : { photo }),
        },
        blocks: { blocks: storeCategoryBlocks(demo).map(toBlockZoneEntry) },
      })
    }

    for (const demo of copy.products) {
      const photo = media[`product-${demo.key}`]
      await productStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          name: demo.name,
          slug: demo.slug,
          description: demo.description,
          price: demo.price,
          currency: 'EUR',
          category: categoryOf(copy, demo.category).name,
          inStock: demo.inStock,
          material: demo.material,
          dimensions: demo.dimensions,
          ...(demo.weight === undefined ? {} : { weight: demo.weight }),
          ...(demo.capacity === undefined ? {} : { capacity: demo.capacity }),
          origin: demo.origin,
          care: demo.care,
          delivery: demo.delivery,
          orderLink: orderLinkFor(siteName, demo.name, copy.locale),
          ...(photo === undefined ? {} : { photo }),
        },
        blocks: { blocks: storeProductBlocks(copy, demo).map(toBlockZoneEntry) },
      })
    }

    for (const demo of buildStoreDemoPages({ siteName, media, locale: copy.locale })) {
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
export function createStoreContentPack(locale: string): BlueprintContentPack {
  const copy = storeCopyFor(locale)
  return {
    collections: storeSchema(copy).collections,
    recommendedAgents: STORE_RECOMMENDED_AGENTS,
    seedDemoContent: seedStoreDemoContent(copy),
    defaultTheme: '@cogenta/theme-ecommerce',
    menus: storeMenus(copy),
    widgets: storeWidgets(copy),
    siteSettings: storeSiteSettings(copy),
    mediaSpecs: storeMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const storeContentPack: BlueprintContentPack = createStoreContentPack('en')
