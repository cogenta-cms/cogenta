import type { VocabularyBlock } from '@cogenta/blocks'
import type { DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  richTextParagraph,
  SEO_FIELDS,
  toBlockZoneEntry,
} from './content-pack.js'

/**
 * The `store` blueprint's content model (L22 task 10): an online store's
 * public catalogue — a `product` collection, grouped by `category` the same
 * restrained way `restaurant`'s `menuItem` and `magazine`'s `article` group
 * (one field, not a second collection).
 *
 * **Deliberately contract A only, not `@cogenta/commerce` (contract E,
 * ADR-0024).** A blueprint here writes `cogenta.schema.mjs` and seeds demo
 * *content* — it has no way to also provision commerce's own tables
 * (`Product`/`Variant`/`Cart`/`Order`/…), and even if it did, there is
 * nowhere for a shopper to act on them yet: `docs/lots/L10-cms-complet.md`
 * § L15 records, honestly, that the storefront has no admin screens
 * (`packages/admin` gets its design system in L11) and no vitrine blocks
 * for cart/checkout (contract B is figed — a new block needs an RFC, not a
 * side effect of an installer blueprint). Shipping a `product` collection
 * with a browsable catalogue, real photos, prices and categories is a
 * genuine, useful starting point on its own — a lookbook a shop owner can
 * publish, edit and link to an external checkout — and it is exactly what
 * `contentRef` (contract E) is for the day `@cogenta/commerce` is wired to a
 * real site: it points *at* an entry in a collection shaped like this one,
 * it does not require one to already exist.
 */

export const product = defineCollection({
  name: 'product',
  labels: { singular: 'Product', plural: 'Products' },
  routing: { pattern: '/shop/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 300, multiline: true }),
    price: f.number({ required: true, min: 0 }),
    category: f.select({ options: ['Apparel', 'Home', 'Accessories'], required: true }),
    inStock: f.boolean(),
    photo: f.media({ accept: ['image'] }),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['category']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const STORE_COLLECTIONS: readonly CollectionDefinition[] = [product, page]

validateCollectionSet(STORE_COLLECTIONS)

export interface StoreDemoProduct {
  readonly name: string
  readonly slug: string
  readonly description: string
  readonly price: number
  readonly category: 'Apparel' | 'Home' | 'Accessories'
  readonly inStock: boolean
}

export const STORE_DEMO_PRODUCTS: readonly StoreDemoProduct[] = [
  {
    name: 'Field jacket',
    slug: 'field-jacket',
    description: 'Waxed cotton, brass hardware, a fit that layers over anything.',
    price: 168,
    category: 'Apparel',
    inStock: true,
  },
  {
    name: 'Everyday tee',
    slug: 'everyday-tee',
    description: 'Heavyweight combed cotton, garment-dyed so the colour ages evenly.',
    price: 32,
    category: 'Apparel',
    inStock: true,
  },
  {
    name: 'Ceramic pour-over set',
    slug: 'ceramic-pour-over-set',
    description: 'A dripper, a server and two cups, thrown by the same hand.',
    price: 74,
    category: 'Home',
    inStock: true,
  },
  {
    name: 'Linen table runner',
    slug: 'linen-table-runner',
    description: 'Stonewashed linen, hemmed by hand, softer with every wash.',
    price: 38,
    category: 'Home',
    inStock: false,
  },
  {
    name: 'Canvas tote',
    slug: 'canvas-tote',
    description: 'Fourteen-ounce canvas, a base wide enough for a week of groceries.',
    price: 28,
    category: 'Accessories',
    inStock: true,
  },
  {
    name: 'Leather card holder',
    slug: 'leather-card-holder',
    description: 'Vegetable-tanned leather, four card slots, no stitching to fail.',
    price: 46,
    category: 'Accessories',
    inStock: true,
  },
]

const BLOCK_VERSION = '1.0.0'

export interface StoreDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + a live grid of the catalogue + a trust-signal `featureGrid`)
 * and `shipping-returns` (the two questions every new shop's visitors ask
 * before they ask anything else).
 */
export const STORE_DEMO_PAGES: readonly StoreDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Online store',
        title: 'Made to be used, not shelved',
        subtitle:
          'Scaffolded by create-cogenta from the "store" blueprint, with a real demo catalogue already in place.',
        actions: [{ label: 'Browse the shop', target: { href: '/shop' }, emphasis: 'primary' }],
      },
      {
        _key: 'demo-home-products',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'From the shop',
        collection: 'product',
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 10,
        layout: 'grid',
      },
      {
        _key: 'demo-home-trust',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'Why people order twice',
        items: [
          {
            _key: 'demo-trust-1',
            icon: 'package',
            title: 'Made in small runs',
            text: 'Every item here is restocked in batches, not held in a warehouse for a season.',
          },
          {
            _key: 'demo-trust-2',
            icon: 'return',
            title: 'Thirty-day returns',
            text: "If it doesn't fit or isn't right, send it back — no restocking fee, no questions.",
          },
          {
            _key: 'demo-trust-3',
            icon: 'craft',
            title: 'Made to be repaired',
            text: 'Torn a seam or lost a strap? We fix what we sell, at cost, for as long as we sell it.',
          },
        ],
      },
    ],
  },
  {
    title: 'Shipping & returns',
    slug: 'shipping-returns',
    blocks: [
      richProse(
        'demo-shipping-prose',
        'This is a demo store, scaffolded by create-cogenta from the "store" blueprint. Its catalogue and this page were seeded by the installer so there is real content to look at from the first run.',
      ),
      {
        _key: 'demo-shipping-faq',
        _type: 'faq',
        _version: BLOCK_VERSION,
        title: 'Before you order',
        items: [
          {
            _key: 'demo-shipping-faq-1',
            question: 'How long does shipping take?',
            answer: richTextParagraph(
              'demo-shipping-faq-1-a',
              'Two to four business days for in-stock items. An item marked out of stock ships as soon as the next batch is ready — the product page says when.',
            ),
          },
          {
            _key: 'demo-shipping-faq-2',
            question: 'Can I return something?',
            answer: richTextParagraph(
              'demo-shipping-faq-2-a',
              'Yes, within thirty days, unworn and with its tag on. Return shipping is on us for a wrong size.',
            ),
          },
          {
            _key: 'demo-shipping-faq-3',
            question: 'Do you ship internationally?',
            answer: richTextParagraph(
              'demo-shipping-faq-3-a',
              'To most countries, at checkout-calculated rates. Duties are the buyer’s, and we say so before payment, not after.',
            ),
          },
        ],
      },
    ],
  },
]

function richProse(key: string, text: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richTextParagraph(`${key}-body`, text),
  } as VocabularyBlock
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

/**
 * Inserts the `store` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedStoreDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const productStore = createContentStore({ db, collection: product, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of STORE_DEMO_PRODUCTS) {
    await productStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        price: demo.price,
        category: demo.category,
        inStock: demo.inStock,
      },
    })
  }

  for (const demo of STORE_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const storeContentPack: BlueprintContentPack = {
  collections: STORE_COLLECTIONS,
  recommendedAgents: STORE_RECOMMENDED_AGENTS,
  seedDemoContent: seedStoreDemoContent,
}
