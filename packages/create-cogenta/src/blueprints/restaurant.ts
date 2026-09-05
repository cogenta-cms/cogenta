import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { avatarArt, coverArt, heroArt, type Palette } from '../demo-art/compositions.js'
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
 * The `restaurant` blueprint (L25 task A0b/Phase 1): a `menu_item`
 * collection — grouped by `category` rather than a separate category
 * collection, the same restraint `store`'s `product` and `magazine`'s
 * `article` already use — plus a genuinely rich single-page home that
 * `@cogenta/theme-restaurant` renders as a real, priced, grouped menu
 * (never a card grid: contract B is frozen, a "menu" block would need an
 * RFC — `docs/lots/L25-templates-pro.md` "pièges connus").
 *
 * Rewritten in full for L25 (its L9-task-8 predecessor seeded three home
 * blocks and no visuals at all): twelve dishes across four categories, a
 * real hero/gallery/testimonial/hours composition, real menus and site
 * settings, and `@cogenta/theme-restaurant` as the default theme.
 */

export const menuItem = defineCollection({
  name: 'menu_item',
  labels: { singular: 'Menu item', plural: 'Menu items' },
  routing: { pattern: '/menu/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 300, multiline: true }),
    price: f.number({ required: true, min: 0 }),
    category: f.select({
      options: ['Starters', 'Mains', 'Desserts', 'Drinks'],
      required: true,
    }),
    photo: f.media({ accept: ['image'] }),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['category']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const RESTAURANT_COLLECTIONS: readonly CollectionDefinition[] = [menuItem, page]

validateCollectionSet(RESTAURANT_COLLECTIONS)

export interface RestaurantDemoMenuItem {
  readonly name: string
  readonly slug: string
  readonly description: string
  readonly price: number
  readonly category: 'Starters' | 'Mains' | 'Desserts' | 'Drinks'
}

export const RESTAURANT_DEMO_MENU_ITEMS: readonly RestaurantDemoMenuItem[] = [
  {
    name: 'Roasted beet salad',
    slug: 'roasted-beet-salad',
    description: 'Beets, goat cheese, walnuts, a light citrus dressing.',
    price: 9.5,
    category: 'Starters',
  },
  {
    name: 'Soup of the day',
    slug: 'soup-of-the-day',
    description: 'Changes with the season, made from scratch every morning.',
    price: 7,
    category: 'Starters',
  },
  {
    name: 'Charred octopus',
    slug: 'charred-octopus',
    description: 'Smoked paprika, potato purée, a thread of olive oil.',
    price: 13,
    category: 'Starters',
  },
  {
    name: 'Pan-seared trout',
    slug: 'pan-seared-trout',
    description: 'Local trout, brown butter, seasonal vegetables.',
    price: 22,
    category: 'Mains',
  },
  {
    name: 'Wild mushroom risotto',
    slug: 'wild-mushroom-risotto',
    description: 'Arborio rice, a mix of wild mushrooms, parmesan.',
    price: 18,
    category: 'Mains',
  },
  {
    name: 'Slow-roast duck leg',
    slug: 'slow-roast-duck-leg',
    description: 'Duck confit, braised red cabbage, a juniper jus.',
    price: 26,
    category: 'Mains',
  },
  {
    name: 'Chocolate tart',
    slug: 'chocolate-tart',
    description: 'Dark chocolate, sea salt, a short pastry crust.',
    price: 8,
    category: 'Desserts',
  },
  {
    name: 'Poached pear',
    slug: 'poached-pear',
    description: 'Red wine, cinnamon, a mascarpone cream.',
    price: 7.5,
    category: 'Desserts',
  },
  {
    name: 'Crème brûlée',
    slug: 'creme-brulee',
    description: 'Vanilla bean custard, a caramelised sugar crust.',
    price: 7,
    category: 'Desserts',
  },
  {
    name: 'House red, glass',
    slug: 'house-red-glass',
    description: 'A Rhône blend, poured from the barrel.',
    price: 6,
    category: 'Drinks',
  },
  {
    name: 'House white, glass',
    slug: 'house-white-glass',
    description: 'Crisp, dry, chilled by the glass.',
    price: 6,
    category: 'Drinks',
  },
  {
    name: 'Sparkling water',
    slug: 'sparkling-water',
    description: 'Still or sparkling, a shared bottle.',
    price: 3,
    category: 'Drinks',
  },
]

const BLOCK_VERSION = '1.0.0'

function proseBlock(key: string, paragraphs: readonly string[]): VocabularyBlock {
  const body: RichTextDocument = paragraphs.map((text, index) => ({
    _key: `${key}-p${index}`,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `${key}-p${index}-s`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }))
  return { _key: key, _type: 'prose', _version: BLOCK_VERSION, body } as VocabularyBlock
}

/** A bullet list of opening-hours rows — contract A's rich text has no table node, so a simple list is the honest, structured equivalent (fiche L25, "no HTML in a block", R3). */
function hoursAnswer(key: string, rows: readonly string[]): RichTextDocument {
  return rows.map((text, index) => ({
    _key: `${key}-r${index}`,
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: `${key}-r${index}-s`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }))
}

/**
 * The home page's nine blocks (L25 Annexe brief): hero, "Our story",
 * the priced menu, a gallery, the numbers, a testimonial, hours &
 * location, a map, and the closing call to action. Every block's `_key`
 * doubles as a real DOM anchor (`@cogenta/theme-restaurant`'s
 * `renderPage`) — the header/footer menus below link straight into them,
 * so the site reads as one considered page rather than a maze of empty
 * stubs.
 *
 * A function of `media` (`SeedContext.media`), not a static const: the
 * hero/gallery/testimonial media fields need ids `seedDemoMedia` only
 * knows at scaffold time.
 */
export function buildRestaurantHomeBlocks(
  media: Readonly<Record<string, string>>,
): readonly VocabularyBlock[] {
  const galleryItems = [1, 2, 3, 4, 5, 6]
    .map((n) => media[`gallery-${n}`])
    .filter((id): id is string => id !== undefined)
    .map((id, index) => ({ _key: `home-gallery-${index}`, media: id }))

  return [
    {
      _key: 'home-hero',
      _type: 'hero',
      _version: BLOCK_VERSION,
      eyebrow: 'Est. 1994 · Lyon',
      title: 'Amaranthe',
      subtitle: 'Seasonal cooking, two streets from the market, since 1994.',
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [
        { label: 'Reserve a table', target: { href: '/#home-cta' }, emphasis: 'primary' },
        { label: 'View the menu', target: { href: '/#home-menu' } },
      ],
    } as VocabularyBlock,
    proseBlock('home-story', [
      'Amaranthe opened in 1994, two streets from the market, with a kitchen built around what the stalls had that morning rather than a fixed idea of what a restaurant menu should say.',
      'Thirty years on, the room still seats thirty-two, the walk to the market is still five minutes, and the menu is still written after buying, never before.',
    ]),
    {
      _key: 'home-menu',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: 'The menu',
      collection: 'menu_item',
      sort: { field: 'createdAt', direction: 'asc' },
      limit: 12,
      layout: 'grid',
    },
    // A `gallery` needs at least one item (contract B) — with no media
    // seeded (`buildRestaurantHomeBlocks({})`, exercised directly by
    // `blueprint-demo-blocks.test.ts`) the block is left out entirely
    // rather than emitted empty and invalid.
    ...(galleryItems.length === 0
      ? []
      : [
          {
            _key: 'home-gallery',
            _type: 'gallery',
            _version: BLOCK_VERSION,
            layout: 'masonry',
            items: galleryItems,
          } as VocabularyBlock,
        ]),
    {
      _key: 'home-stats',
      _type: 'stats',
      _version: BLOCK_VERSION,
      items: [
        { _key: 'home-stats-1', value: '1994', label: 'Serving since' },
        { _key: 'home-stats-2', value: '3', label: 'Chefs' },
        { _key: 'home-stats-3', value: '120', label: 'Seats' },
        { _key: 'home-stats-4', value: '1', label: 'Michelin mention' },
      ],
    },
    {
      _key: 'home-testimonial',
      _type: 'testimonial',
      _version: BLOCK_VERSION,
      quote: richTextParagraph(
        'home-testimonial-quote',
        'A quietly confident kitchen — the kind of unhurried evening we keep coming back for.',
      ),
      attribution: {
        name: 'M. Bernard',
        role: 'Guestbook, 2026',
        ...(media.avatar === undefined ? {} : { avatar: media.avatar }),
      },
    } as VocabularyBlock,
    {
      _key: 'home-hours',
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: 'Hours & location',
      items: [
        {
          _key: 'home-hours-1',
          question: 'Opening hours',
          answer: hoursAnswer('home-hours-1', [
            'Tuesday – Thursday: 18:00–22:30',
            'Friday – Saturday: 18:00–23:00',
            'Sunday: 12:00–15:00',
            'Closed Monday',
          ]),
        },
        {
          _key: 'home-hours-2',
          question: 'Address',
          answer: richTextParagraph('home-hours-2-a', '12 Rue du Marché, 69001 Lyon.'),
        },
        {
          _key: 'home-hours-3',
          question: 'Parking',
          answer: richTextParagraph(
            'home-hours-3-a',
            'No dedicated parking. The Presqu’île car park is a five-minute walk and free after 19:00.',
          ),
        },
      ],
    },
    {
      _key: 'home-map',
      _type: 'embed',
      _version: BLOCK_VERSION,
      provider: 'other',
      url: 'https://www.openstreetmap.org/?mlat=45.767&mlon=4.834#map=16/45.767/4.834',
      ratio: '16:9',
      consentRequired: true,
    },
    {
      _key: 'home-cta',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'Book now',
      text: 'Reservations recommended on weekends.',
      actions: [
        {
          label: 'Book now',
          target: { href: 'mailto:reservations@amaranthe.example' },
          emphasis: 'primary',
        },
        { label: 'Call us', target: { href: 'tel:+33472000000' } },
      ],
    },
  ]
}

export interface RestaurantDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

export function buildRestaurantDemoPages(
  media: Readonly<Record<string, string>>,
): readonly RestaurantDemoPage[] {
  return [
    { title: 'Home', slug: 'home', blocks: buildRestaurantHomeBlocks(media) },
    {
      title: 'Privacy',
      slug: 'privacy',
      blocks: [
        proseBlock('privacy-body', [
          'Amaranthe collects only what a reservation needs: a name, a phone number, and a party size. Nothing is sold, and nothing is kept once the table has come and gone.',
        ]),
      ],
    },
  ]
}

/**
 * `restaurant`'s own starting skin (`starting-skins.js`) — asserted
 * present with a real check, not a `!`, since `STARTING_SKINS` is keyed by
 * blueprint id and TypeScript cannot see that this particular key is
 * always populated.
 */
function restaurantPalette(): Palette {
  const skin = STARTING_SKINS.restaurant
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.restaurant is missing.',
      hint: 'The "restaurant" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural demo visuals (L25 D1): a warm, elegant hero backdrop, one
 * cover photo per dish (`coverArt`, keyed by slug so `seedRestaurantDemoContent`
 * can look each one up without caring what id the media store assigned
 * it), six gallery images, and one avatar for the guestbook testimonial.
 */
export const RESTAURANT_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(restaurantPalette(), 'radial', 7),
    alt: 'A warm, softly lit backdrop for the restaurant hero',
  },
  ...RESTAURANT_DEMO_MENU_ITEMS.map(
    (demo, index): DemoMediaSpec => ({
      name: `dish-${demo.slug}`,
      spec: coverArt(restaurantPalette(), 100 + index),
      alt: `${demo.name}, plated`,
    }),
  ),
  ...[1, 2, 3, 4, 5, 6].map(
    (n): DemoMediaSpec => ({
      name: `gallery-${n}`,
      spec: coverArt(restaurantPalette(), 200 + n),
      alt: 'The dining room, an abstract composition',
    }),
  ),
  {
    name: 'avatar',
    spec: avatarArt(restaurantPalette(), 301),
    alt: 'An abstract avatar composition, standing in for a guest photo',
  },
]

/** Header/footer navigation and the header "Reserve" button (L25 D4) — every link an in-page anchor into the home page's own blocks, except the real "Privacy" page. */
export const RESTAURANT_MENUS: BlueprintMenus = {
  header: [
    { label: 'Menu', url: '/#home-menu' },
    { label: 'Our story', url: '/#home-story' },
    { label: 'Gallery', url: '/#home-gallery' },
    { label: 'Contact', url: '/#home-hours' },
  ],
  footer: [
    { label: 'Menu', url: '/#home-menu' },
    { label: 'Reservations', url: '/#home-cta' },
    { label: 'Privacy', url: '/privacy' },
  ],
  headerAction: { label: 'Reserve', url: '/#home-cta' },
}

export const RESTAURANT_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Seasonal cooking, since 1994.',
  'general.socialLinks': [
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'Facebook', url: 'https://facebook.com/example' },
    { label: 'Reviews', url: 'https://example.com/reviews' },
  ],
  'general.footerNote': 'Amaranthe · 12 Rue du Marché, 69001 Lyon · +33 4 72 00 00 00',
}

export const RESTAURANT_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits the menu and contact pages so the restaurant is findable by name and cuisine.',
  },
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized food photography before it slows the menu page down.',
  },
]

/**
 * Inserts the `restaurant` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule). Each dish's `photo` and the
 * home page's hero/gallery/testimonial media come from `ctx.media`
 * (`seedDemoMedia`/`RESTAURANT_MEDIA_SPECS`) — absent (a caller that never
 * ran `seedDemoMedia`) simply leaves those fields unset, since none of
 * them is `required` on its collection/block.
 */
async function seedRestaurantDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const menuItemStore = createContentStore({ db, collection: menuItem, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of RESTAURANT_DEMO_MENU_ITEMS) {
    const photo = media[`dish-${demo.slug}`]
    await menuItemStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        price: demo.price,
        category: demo.category,
        ...(photo === undefined ? {} : { photo }),
      },
    })
  }

  for (const demo of buildRestaurantDemoPages(media)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const restaurantContentPack: BlueprintContentPack = {
  collections: RESTAURANT_COLLECTIONS,
  recommendedAgents: RESTAURANT_RECOMMENDED_AGENTS,
  seedDemoContent: seedRestaurantDemoContent,
  defaultTheme: '@cogenta/theme-restaurant',
  menus: RESTAURANT_MENUS,
  siteSettings: RESTAURANT_SITE_SETTINGS,
  mediaSpecs: RESTAURANT_MEDIA_SPECS,
}
