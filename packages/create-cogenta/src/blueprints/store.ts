import type { VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import {
  avatarArt,
  coverArt,
  heroArt,
  logoArt,
  type Palette,
  productArt,
} from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  richTextParagraph,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'

/**
 * The `store` blueprint's content model (L22 task 10, L25 "templates pro"
 * passe pro): an online store's public catalogue — a `product` collection,
 * grouped by `category`.
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

const CATEGORIES = ['Apparel', 'Home', 'Accessories', 'Outdoor'] as const
type ProductCategory = (typeof CATEGORIES)[number]

export const product = defineCollection({
  name: 'product',
  labels: { singular: 'Product', plural: 'Products' },
  routing: { pattern: '/shop/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 300, multiline: true }),
    price: f.number({ required: true, min: 0 }),
    category: f.select({ options: [...CATEGORIES], required: true }),
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
  readonly category: ProductCategory
  readonly inStock: boolean
}

/**
 * Twelve products, three per category, real prices, real (if brief)
 * copy — the "New arrivals"/"Best sellers" home sections and the `/shop`,
 * `/new` and `/categories` pages all read from this one list rather than
 * three divergent ones. Three are `inStock: false`, spread across three
 * different categories, so the out-of-stock badge (`theme-ecommerce`'s
 * `collection-list.ts`) is exercised on more than one card in the demo.
 */
export const STORE_DEMO_PRODUCTS: readonly StoreDemoProduct[] = [
  // Apparel
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
    name: 'Wool overshirt',
    slug: 'wool-overshirt',
    description: 'Brushed merino, a shirt-jacket cut for the coldest half of the year.',
    price: 98,
    category: 'Apparel',
    inStock: false,
  },
  // Home
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
    name: 'Cast-iron skillet',
    slug: 'cast-iron-skillet',
    description: 'Pre-seasoned, ten inches, the one pan that outlasts the kitchen it started in.',
    price: 56,
    category: 'Home',
    inStock: true,
  },
  // Accessories
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
  {
    name: 'Wool beanie',
    slug: 'wool-beanie',
    description: 'Ribbed merino, one size, blocked so it keeps its shape past the first wash.',
    price: 24,
    category: 'Accessories',
    inStock: false,
  },
  // Outdoor
  {
    name: 'Camp blanket',
    slug: 'camp-blanket',
    description: 'A dense wool weave, wide enough for two, tight enough to block the wind.',
    price: 64,
    category: 'Outdoor',
    inStock: true,
  },
  {
    name: 'Enamel mug',
    slug: 'enamel-mug',
    description: 'Chip-resistant steel core, the mug that survives the bottom of a pack.',
    price: 18,
    category: 'Outdoor',
    inStock: true,
  },
  {
    name: 'Trail tote',
    slug: 'trail-tote',
    description: 'Ripstop nylon, a roll-top closure, light enough to forget you brought it.',
    price: 42,
    category: 'Outdoor',
    inStock: true,
  },
]

const BLOCK_VERSION = '1.0.0'

export interface StoreDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

function richProse(key: string, text: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richTextParagraph(`${key}-body`, text),
  } as VocabularyBlock
}

/**
 * A category's own filtered grid — `filter: { category }` (contract B's
 * `collectionList.filter`, a flat field/value record `cogenta serve`
 * resolves to a real equality query, `theme-render.ts`'s `toApiFilter`) —
 * so `/categories` is a genuine browse-by-category page, not a second copy
 * of `/shop`.
 */
function categoryGrid(key: string, category: ProductCategory): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    title: category,
    collection: 'product',
    filter: { category },
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 6,
    layout: 'grid',
  } as VocabularyBlock
}

/**
 * `home` (the ten-block composition the L25 brief asks for: hero → category
 * tiles → new arrivals → promo → why-buy-from-us → best sellers →
 * testimonial → trust badges → faq → newsletter), `shop` (the full
 * catalogue), `new` (a dedicated arrivals page — what the header's "New"
 * link actually goes to), `categories` (one filtered grid per category),
 * `about`, `help` (the shipping/returns questions, what the footer's "Help"
 * link and the header's old "Shipping & Returns" item both point at now),
 * and `legal` (a short, honest placeholder — this is a demo store, not a
 * real merchant, and a footer link that goes nowhere is worse than one that
 * says so).
 *
 * A function of `media` (`SeedContext.media`, L25 task A0b), not a static
 * const: the hero's `media`, the category tiles and the testimonial avatar
 * all need ids only `seedDemoMedia` knows at scaffold time.
 */
export function buildStoreDemoPages(
  media: Readonly<Record<string, string>>,
): readonly StoreDemoPage[] {
  // `gallery` (blocks@2.0) requires at least one item — a media map with no
  // `category-*` entries (a scaffold with no demo-art seeded, or this
  // function called directly, as the blueprint test does) must therefore
  // omit the whole block rather than emit an empty, contract-invalid one.
  const categoryTiles = CATEGORIES.map((category, index) => ({
    category,
    media: media[`category-${index}`],
  })).filter(
    (item): item is { category: ProductCategory; media: string } => item.media !== undefined,
  )

  // `logoStrip` (blocks@2.0) requires at least one logo — same reasoning.
  const logoItems = [0, 1, 2, 3, 4]
    .map((index) => media[`logo-${index}`])
    .filter((id): id is string => id !== undefined)
    .map((id, index) => ({ _key: `demo-logo-${index}`, media: id }))

  return [
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
          ...(media.hero === undefined ? {} : { media: media.hero }),
          actions: [{ label: 'Shop now', target: { href: '/shop' }, emphasis: 'primary' }],
        } as VocabularyBlock,
        ...(categoryTiles.length === 0
          ? []
          : [
              {
                _key: 'demo-home-categories',
                _type: 'gallery',
                _version: BLOCK_VERSION,
                layout: 'grid',
                items: categoryTiles.map((tile, index) => ({
                  _key: `demo-category-${index}`,
                  media: tile.media,
                })),
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-home-new-arrivals',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'New arrivals',
          collection: 'product',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 8,
          layout: 'grid',
        } as VocabularyBlock,
        {
          _key: 'demo-home-promo',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Free shipping over $75',
          text: 'No code needed — it applies automatically at checkout on every order that qualifies.',
          actions: [{ label: 'Browse the shop', target: { href: '/shop' }, emphasis: 'primary' }],
        } as VocabularyBlock,
        {
          _key: 'demo-home-trust',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Why buy from us',
          items: [
            {
              _key: 'demo-trust-1',
              icon: 'truck',
              title: 'Fast, tracked shipping',
              text: 'Two to four business days on every in-stock order, a tracking number the moment it leaves.',
            },
            {
              _key: 'demo-trust-2',
              icon: 'refresh',
              title: 'Thirty-day returns',
              text: "If it doesn't fit or isn't right, send it back — no restocking fee, no questions.",
            },
            {
              _key: 'demo-trust-3',
              icon: 'shield',
              title: 'Made to be repaired',
              text: 'Torn a seam or lost a strap? We fix what we sell, at cost, for as long as we sell it.',
            },
            {
              _key: 'demo-trust-4',
              icon: 'credit-card',
              title: 'Secure checkout',
              text: 'Encrypted payment, every time — your card details never touch our own servers.',
            },
          ],
        } as VocabularyBlock,
        {
          _key: 'demo-home-best-sellers',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Best sellers',
          collection: 'product',
          // Deliberately a different sort from "New arrivals" above — not a
          // real popularity signal (no such field exists in contract A, and
          // `SortField` is closed to `id`/`createdAt`/`updatedAt`), but a
          // visibly distinct cut of the same catalogue rather than a
          // reshuffled duplicate of the section above it.
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 4,
          layout: 'grid',
        } as VocabularyBlock,
        {
          _key: 'demo-home-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph(
            'demo-testimonial-quote',
            'Ordered the field jacket on a Tuesday, wore it hiking that Saturday. Still my favourite thing I own a year on.',
          ),
          attribution: {
            name: 'Rosa Ibarra',
            role: 'Verified buyer',
            ...(media.avatar === undefined ? {} : { avatar: media.avatar }),
          },
        } as VocabularyBlock,
        ...(logoItems.length === 0
          ? []
          : [
              {
                _key: 'demo-home-logos',
                _type: 'logoStrip',
                _version: BLOCK_VERSION,
                logos: logoItems,
                caption: 'As seen in',
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-home-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Before you order',
          items: [
            {
              _key: 'demo-home-faq-1',
              question: 'How long does shipping take?',
              answer: richTextParagraph(
                'demo-home-faq-1-a',
                'Two to four business days for in-stock items. An item marked out of stock ships as soon as the next batch is ready — the product page says when.',
              ),
            },
            {
              _key: 'demo-home-faq-2',
              question: 'Can I return something?',
              answer: richTextParagraph(
                'demo-home-faq-2-a',
                'Yes, within thirty days, unworn and with its tag on. Return shipping is on us for a wrong size.',
              ),
            },
            {
              _key: 'demo-home-faq-3',
              question: 'How do I know what size to order?',
              answer: richTextParagraph(
                'demo-home-faq-3-a',
                'Every product page lists true-to-size guidance; when in doubt, size up — exchanges are free within thirty days.',
              ),
            },
            {
              _key: 'demo-home-faq-4',
              question: 'What payment methods do you accept?',
              answer: richTextParagraph(
                'demo-home-faq-4-a',
                'Every major card, plus the wallet your browser already offers at checkout — no account required to buy.',
              ),
            },
          ],
        } as VocabularyBlock,
        {
          _key: 'demo-home-newsletter',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Get 10% off your first order',
          text: 'Sign up for restock alerts and the occasional sale — no spam, unsubscribe in one click.',
          actions: [{ label: 'Sign up', target: { href: '/shop' }, emphasis: 'primary' }],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Shop',
      slug: 'shop',
      blocks: [
        richProse(
          'demo-shop-prose',
          'Every piece here, from a demo catalogue seeded by create-cogenta so there is a real shop to browse from the first run.',
        ),
        {
          _key: 'demo-shop-products',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'All products',
          collection: 'product',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 24,
          layout: 'grid',
        } as VocabularyBlock,
      ],
    },
    {
      title: 'New Arrivals',
      slug: 'new',
      blocks: [
        richProse('demo-new-prose', 'The latest additions to the catalogue, newest first.'),
        {
          _key: 'demo-new-products',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'New in',
          collection: 'product',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 12,
          layout: 'grid',
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Categories',
      slug: 'categories',
      blocks: [
        richProse('demo-categories-prose', 'Browse the catalogue by category.'),
        ...CATEGORIES.map((category, index) => categoryGrid(`demo-categories-${index}`, category)),
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        richProse(
          'demo-about-prose',
          'This is a demo store, scaffolded by create-cogenta from the "store" blueprint. Its catalogue and this page were seeded by the installer so there is real content to look at from the first run — every word of it is normal, editable content.',
        ),
        {
          _key: 'demo-about-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph(
            'demo-about-testimonial-quote',
            'A real person answered my email about a sizing question within the hour, on a Sunday.',
          ),
          attribution: { name: 'Devon Marsh', role: 'Verified buyer' },
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Help',
      slug: 'help',
      blocks: [
        richProse(
          'demo-help-prose',
          'This is a demo store, scaffolded by create-cogenta from the "store" blueprint. Its catalogue and this page were seeded by the installer so there is real content to look at from the first run.',
        ),
        {
          _key: 'demo-help-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Shipping & returns',
          items: [
            {
              _key: 'demo-help-faq-1',
              question: 'How long does shipping take?',
              answer: richTextParagraph(
                'demo-help-faq-1-a',
                'Two to four business days for in-stock items. An item marked out of stock ships as soon as the next batch is ready — the product page says when.',
              ),
            },
            {
              _key: 'demo-help-faq-2',
              question: 'Can I return something?',
              answer: richTextParagraph(
                'demo-help-faq-2-a',
                'Yes, within thirty days, unworn and with its tag on. Return shipping is on us for a wrong size.',
              ),
            },
            {
              _key: 'demo-help-faq-3',
              question: 'Do you ship internationally?',
              answer: richTextParagraph(
                'demo-help-faq-3-a',
                'To most countries, at checkout-calculated rates. Duties are the buyer’s, and we say so before payment, not after.',
              ),
            },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Legal',
      slug: 'legal',
      blocks: [
        richProse(
          'demo-legal-prose',
          'This is a demo store, scaffolded by create-cogenta from the "store" blueprint — there is no real merchant, no real transaction, and no real terms of sale behind it. A real store publishes its own terms, privacy notice and returns policy here before taking a single order.',
        ),
      ],
    },
  ]
}

/**
 * `store`'s own starting skin (`starting-skins.js`) — asserted present with
 * a real check, not a `!`, since `STARTING_SKINS` is keyed by blueprint id
 * and TypeScript cannot see that this particular key is always populated.
 */
function storePalette(): Palette {
  const skin = STARTING_SKINS.store
  if (skin === undefined) {
    // Same code `resolveBlueprint` (`registry.ts`) uses for its own
    // "this cannot happen unless the registry itself is broken" guard —
    // this is a bug in starting-skins.ts, never a user-facing condition.
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.store is missing.',
      hint: 'The "store" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural visuals this blueprint seeds (L25 task A0b, extended by the L25
 * "templates pro" passe pro): a flat hero backdrop, one cover image per
 * category (the gallery tiles' own caption is that category's picture's
 * `alt` text — `gallery`'s item has no caption field of its own), one
 * product photo per demo product, one avatar for the testimonial and five
 * neutral marks for the trust-badge strip — all from the same starting-skin
 * palette (`starting-skins.js`) this blueprint already ships, keyed so
 * `seedStoreDemoContent`/`buildStoreDemoPages` can look each one up without
 * caring what id the media store assigned it.
 */
export const STORE_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    // A flat family (D5): geometric colour blocks, not a mesh/gradient
    // backdrop — this storefront's own identity, kept flat.
    spec: heroArt(storePalette(), 'blocks', 11),
    alt: 'Abstract geometric backdrop for the store hero',
  },
  ...CATEGORIES.map(
    (category, index): DemoMediaSpec => ({
      name: `category-${index}`,
      spec: coverArt(storePalette(), 50 + index),
      alt: category,
    }),
  ),
  ...STORE_DEMO_PRODUCTS.map(
    (demo, index): DemoMediaSpec => ({
      name: `product-${demo.slug}`,
      spec: productArt(storePalette(), index + 1),
      alt: `${demo.name} product photo`,
    }),
  ),
  {
    name: 'avatar',
    spec: avatarArt(storePalette(), 60),
    alt: 'Abstract avatar mark for the testimonial',
  },
  ...[0, 1, 2, 3, 4].map(
    (index): DemoMediaSpec => ({
      name: `logo-${index}`,
      spec: logoArt(70 + index),
      alt: `Press or payment mark ${index + 1}`,
    }),
  ),
]

/** Header/footer navigation and the header call-to-action button (L25 task A0b, D4). */
export const STORE_MENUS: BlueprintMenus = {
  header: [
    { label: 'Home' },
    { label: 'Shop', url: '/shop' },
    { label: 'New', url: '/new' },
    { label: 'Categories', url: '/categories' },
    { label: 'About', url: '/about' },
  ],
  footer: [
    { label: 'Shop', url: '/shop' },
    { label: 'Help', url: '/help' },
    { label: 'Legal', url: '/legal' },
  ],
  headerAction: { label: 'Shop now', url: '/shop' },
}

/**
 * `general.tagline` is already a declared registry key. `general.socialLinks`
 * and `general.footerNote` are seeded by Phase 0 (task A0a) — three links
 * (L25 "templates pro" passe pro: Instagram, Pinterest, X — a lookbook-style
 * shop leans on visual channels first).
 */
export const STORE_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Made to be used, not shelved.',
  'general.socialLinks': [
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'Pinterest', url: 'https://pinterest.com/example' },
    { label: 'X', url: 'https://x.com/example' },
  ],
  'general.footerNote': 'A demo store, scaffolded by create-cogenta.',
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
 * `ContentStore` — never mocked (house rule). Each product's `photo` and the
 * home hero's `media` come from `ctx.media`
 * (`seedDemoMedia`/`STORE_MEDIA_SPECS`) — absent (e.g. a blueprint seeded
 * with `seedDemoContent: false`, or a caller that never ran
 * `seedDemoMedia`) simply leaves those fields unset, since neither is
 * `required` on its collection/block.
 */
async function seedStoreDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const productStore = createContentStore({ db, collection: product, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of STORE_DEMO_PRODUCTS) {
    const photo = media[`product-${demo.slug}`]
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
        ...(photo === undefined ? {} : { photo }),
      },
    })
  }

  for (const demo of buildStoreDemoPages(media)) {
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
  defaultTheme: '@cogenta/theme-ecommerce',
  menus: STORE_MENUS,
  siteSettings: STORE_SITE_SETTINGS,
  mediaSpecs: STORE_MEDIA_SPECS,
}
