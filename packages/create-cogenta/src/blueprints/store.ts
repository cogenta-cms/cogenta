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

/**
 * A real bundled product photo standing in for each category's own gallery
 * tile on the home page (L26) — one photo per category, each an actual
 * demo product that belongs to it, rather than the abstract procedural
 * cover art `coverArt` renders. Falls back to that procedural art anyway
 * (`STORE_MEDIA_SPECS` still sets `spec`) if a photo file is ever missing.
 */
const CATEGORY_PHOTOS: Readonly<Record<ProductCategory, string>> = {
  Apparel: 'store/field-jacket.jpg',
  Home: 'store/cast-iron-skillet.jpg',
  Accessories: 'store/canvas-tote.jpg',
  Outdoor: 'store/camp-blanket.jpg',
}

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
    description:
      'Ten-ounce waxed cotton with brass hardware and a two-way front zip. Layers over a sweater in October and a flannel by December — re-wax it once a season and it will outlast most of what you own.',
    price: 168,
    category: 'Apparel',
    inStock: true,
  },
  {
    name: 'Everyday tee',
    slug: 'everyday-tee',
    description:
      'Heavyweight combed cotton, garment-dyed in small batches so no two runs match exactly, softening more with every wash. Boxy through the body, true to size through the shoulder.',
    price: 32,
    category: 'Apparel',
    inStock: true,
  },
  {
    name: 'Wool overshirt',
    slug: 'wool-overshirt',
    description:
      'Brushed merino in a shirt-jacket cut, heavy enough alone through the coldest months and roomy enough to layer over a sweater. Between batches right now — back once the next run of merino clears the mill.',
    price: 98,
    category: 'Apparel',
    inStock: false,
  },
  // Home
  {
    name: 'Ceramic pour-over set',
    slug: 'ceramic-pour-over-set',
    description:
      'A dripper, a server and two cups, thrown and glazed by the same potter in a single afternoon, so the set you receive is one piece of work, not three. Dishwasher-safe, though the glaze keeps its shine longer if you hand-wash it.',
    price: 74,
    category: 'Home',
    inStock: true,
  },
  {
    name: 'Linen table runner',
    slug: 'linen-table-runner',
    description:
      'Stonewashed European linen, hemmed by hand at both ends, softening and lightening with every wash until it drapes like cloth twice its age. Restocking once the current linen order clears customs.',
    price: 38,
    category: 'Home',
    inStock: false,
  },
  {
    name: 'Cast-iron skillet',
    slug: 'cast-iron-skillet',
    description:
      'Pre-seasoned, ten inches across, cast in one pour so there is no weak seam to eventually crack. Season it twice before the first fried egg and it will outlast this kitchen, then the next one.',
    price: 56,
    category: 'Home',
    inStock: true,
  },
  // Accessories
  {
    name: 'Canvas tote',
    slug: 'canvas-tote',
    description:
      'Fourteen-ounce cotton canvas with a base cut wide enough for a week of groceries, stitched twice at every stress point. Undyed, so it only gets more itself the longer you carry it.',
    price: 28,
    category: 'Accessories',
    inStock: true,
  },
  {
    name: 'Leather card holder',
    slug: 'leather-card-holder',
    description:
      'Vegetable-tanned leather folded and glued, not stitched, into four slots — nothing to catch on a pocket seam, nothing to fray. Arrives pale and darkens to honey wherever your thumb rests most.',
    price: 46,
    category: 'Accessories',
    inStock: true,
  },
  {
    name: 'Wool beanie',
    slug: 'wool-beanie',
    description:
      'Ribbed merino, one size, blocked on a wooden form so it keeps its shape through the first dozen washes rather than stretching out by the second. Back in stock with the next merino delivery.',
    price: 24,
    category: 'Accessories',
    inStock: false,
  },
  // Outdoor
  {
    name: 'Camp blanket',
    slug: 'camp-blanket',
    description:
      'A dense double-wool weave, wide enough for two around a fire and tight enough to actually block the wind. Rolls small enough to strap under a pack, the only test that matters.',
    price: 64,
    category: 'Outdoor',
    inStock: true,
  },
  {
    name: 'Enamel mug',
    slug: 'enamel-mug',
    description:
      'A chip-resistant steel core under two coats of enamel, holding heat longer than aluminium and surviving the bottom of a pack better than ceramic. The first chip in the rim only proves it has been used.',
    price: 18,
    category: 'Outdoor',
    inStock: true,
  },
  {
    name: 'Trail tote',
    slug: 'trail-tote',
    description:
      'Ripstop nylon with a roll-top closure that keeps rain out without a single zipper to jam. Folds flat into its own pocket and weighs little enough to forget you packed it until you need it.',
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
          eyebrow: 'Atelier Goods',
          title: 'Made to be used, not shelved',
          subtitle:
            'Canvas, cast iron, waxed cotton and wool — small-batch goods built to be repaired for a decade rather than replaced after one season.',
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
          'Every piece below is part of the same running catalogue, priced and photographed the way it ships — no placeholder pricing, no filler categories. Sort by newest for what just landed, or jump to a single category from the header if you already know what you are after.',
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
        richProse(
          'demo-new-prose',
          'The latest additions to the catalogue, newest first — usually a small batch that ran out fast the first time and finally got another run, or a piece we finished testing long enough to be confident selling it.',
        ),
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
        richProse(
          'demo-categories-prose',
          'Four ways into the same catalogue, grouped by what a piece is made for rather than when it was added. Apparel and Accessories are what you wear or carry every day; Home and Outdoor are what stays put or comes with you.',
        ),
        ...CATEGORIES.map((category, index) => categoryGrid(`demo-categories-${index}`, category)),
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        richProse(
          'demo-about-prose-1',
          'Atelier Goods started in a two-car garage in 2016, the year the founder got tired of replacing a twenty-dollar tote every winter. The first run was three samples: one canvas bag, one cast-iron pan bought secondhand and re-seasoned, one wool blanket from a mill an hour away that was about to close its doors for lack of orders.',
        ),
        richProse(
          'demo-about-prose-2',
          "Ten years on, the workshop has moved twice and the catalogue has grown to a few dozen pieces, but the rule from that first year hasn't changed: nothing ships that the person making it wouldn't want to own for a decade. Canvas, cast iron, waxed cotton, vegetable-tanned leather, ribbed merino — materials chosen because they age instead of wearing out, and because every one of them can be mended rather than thrown away.",
        ),
        richProse(
          'demo-about-prose-3',
          "That's also why the repair program in the trust section above exists in the first place. A torn strap, a lost button, a seam that finally gives after five years of daily use — send it back and it comes home fixed, at cost, for as long as Atelier Goods sells the piece. Made to be used, not shelved, and the shop tries to mean that literally.",
        ),
        {
          _key: 'demo-about-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph(
            'demo-about-testimonial-quote',
            'I emailed on a Sunday about a sizing question, expecting a bot. A real person answered within the hour, from the workshop, mid-repair on someone else’s jacket.',
          ),
          attribution: { name: 'Devon Marsh', role: 'Verified buyer, field jacket' },
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Help',
      slug: 'help',
      blocks: [
        richProse(
          'demo-help-prose',
          'Shipping, returns and sizing, in one place — most questions about an order end up being one of these three. Anything not covered here goes straight to a real person, not a ticket queue: the same team that packs the order answers the inbox.',
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
          '"Atelier Goods" is a demo storefront, scaffolded by create-cogenta from the "store" blueprint — there is no real merchant, no real transaction, and no real terms of sale behind any of it. A real shop replaces this page with its own terms of sale, privacy notice and returns policy before it takes a single order, since this text carries none of them.',
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
 * Visuals this blueprint seeds (L25 task A0b, extended by the L25
 * "templates pro" passe pro and by L26): a real bundled photo for the hero,
 * each of the twelve products, and — new in L26 — each of the four category
 * tiles (`CATEGORY_PHOTOS`, one real product photo standing in for its whole
 * category, rather than the abstract procedural art the home page's gallery
 * previously showed there). The gallery tiles' own caption is that
 * category's picture's `alt` text — `gallery`'s item has no caption field of
 * its own. Only the testimonial avatar and the five trust-badge marks stay
 * procedural: no bundled photo honestly stands in for an anonymous
 * customer's face or a press/payment mark. Every `spec` here is the
 * fallback `seedDemoMedia` uses if its matching `photo` file is ever
 * missing, all from the same starting-skin palette (`starting-skins.js`)
 * this blueprint already ships, keyed so
 * `seedStoreDemoContent`/`buildStoreDemoPages` can look each one up without
 * caring what id the media store assigned it.
 */
export const STORE_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(storePalette(), 'blocks', 11),
    alt: 'A flat lay of the collection',
    photo: 'store/hero.jpg',
  },
  ...CATEGORIES.map(
    (category, index): DemoMediaSpec => ({
      name: `category-${index}`,
      spec: coverArt(storePalette(), 50 + index),
      alt: category,
      photo: CATEGORY_PHOTOS[category],
    }),
  ),
  ...STORE_DEMO_PRODUCTS.map(
    (demo, index): DemoMediaSpec => ({
      name: `product-${demo.slug}`,
      spec: productArt(storePalette(), index + 1),
      alt: `${demo.name} product photo`,
      photo: `store/${demo.slug}.jpg`,
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
