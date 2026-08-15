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
  toBlockZoneEntry,
} from './content-pack.js'

/**
 * The `restaurant` blueprint's content model (L9 task 8, batch B): a
 * `menuItem` collection, grouped by `category` rather than a separate
 * category collection (the same restraint `magazine`'s `section` field
 * uses — one grouping mechanism, not two). Routed even though nothing
 * deep-links to an individual item today, so the home page's live menu
 * list (`collectionList`) can build a real link for each entry, exactly
 * like every other blueprint's routed, listed collection.
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
    category: f.select({ options: ['Starters', 'Mains', 'Desserts'], required: true }),
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
  readonly category: 'Starters' | 'Mains' | 'Desserts'
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
    description: 'Changes with the season, always made from scratch.',
    price: 7,
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
    name: 'Chocolate tart',
    slug: 'chocolate-tart',
    description: 'Dark chocolate, sea salt, a short pastry crust.',
    price: 8,
    category: 'Desserts',
  },
]

const BLOCK_VERSION = '1.0.0'

function proseParagraph(key: string, text: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: [
      {
        _key: `${key}-block`,
        _type: 'block',
        style: 'normal',
        children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
        markDefs: [],
      },
    ],
  } as VocabularyBlock
}

export interface RestaurantDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + a live list of menu highlights + a cta to reserve) and
 * `contact` (prose with hours and location — plain text fields, contract A
 * has no dedicated "opening hours" field kind and none is warranted for
 * two lines of text).
 */
export const RESTAURANT_DEMO_PAGES: readonly RestaurantDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Restaurant',
        title: 'Seasonal, simple, close to home',
        subtitle:
          'Scaffolded by create-cogenta from the "restaurant" blueprint, with a real demo menu already in place.',
        actions: [{ label: 'Reserve a table', target: { href: '/contact' }, emphasis: 'primary' }],
      },
      {
        _key: 'demo-home-menu',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'From the menu',
        collection: 'menu_item',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 10,
        layout: 'grid',
      },
      {
        _key: 'demo-home-kitchen',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'How we cook',
        items: [
          {
            _key: 'demo-kitchen-1',
            icon: 'market',
            title: 'Bought that morning',
            text: 'The menu is written after the market, not before it. That is why it changes twice a week.',
          },
          {
            _key: 'demo-kitchen-2',
            icon: 'fire',
            title: 'Cooked to order',
            text: 'Nothing is held under a lamp. Twenty minutes on a full service is normal, and worth it.',
          },
          {
            _key: 'demo-kitchen-3',
            icon: 'leaf',
            title: 'Always one of each',
            text: 'A vegetarian main and a dessert without gluten, every service, without needing to be asked.',
          },
        ],
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    blocks: [
      proseParagraph(
        'demo-contact-prose',
        'This is a demo restaurant site, scaffolded by create-cogenta from the "restaurant" blueprint. Its menu and this page were seeded by the installer so there is real content to look at from the first run.',
      ),
      proseParagraph(
        'demo-contact-hours',
        'Open Tuesday to Sunday, 18:00 to 23:00. 12 Market Street. Reservations recommended on weekends.',
      ),
      {
        _key: 'demo-contact-faq',
        _type: 'faq',
        _version: BLOCK_VERSION,
        title: 'Before you book',
        items: [
          {
            _key: 'demo-contact-faq-1',
            question: 'Can you cater for allergies?',
            answer: richTextParagraph(
              'demo-contact-faq-1-a',
              'Tell us when you book rather than on the night — most of the menu can be adjusted with a few hours of notice, and almost none of it can be adjusted at 20:30.',
            ),
          },
          {
            _key: 'demo-contact-faq-2',
            question: 'Do you take large tables?',
            answer: richTextParagraph(
              'demo-contact-faq-2-a',
              'Up to ten, on Tuesday to Thursday. The room seats thirty-two, so a party of ten on a Saturday is a third of the service.',
            ),
          },
          {
            _key: 'demo-contact-faq-3',
            question: 'Is there parking?',
            answer: richTextParagraph(
              'demo-contact-faq-3-a',
              'Not our own. The market car park two streets away is free after 19:00, which is when most people arrive anyway.',
            ),
          },
        ],
      },
    ],
  },
]

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
 * `ContentStore` — never mocked (house rule).
 */
async function seedRestaurantDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const menuItemStore = createContentStore({ db, collection: menuItem, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of RESTAURANT_DEMO_MENU_ITEMS) {
    await menuItemStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        price: demo.price,
        category: demo.category,
      },
    })
  }

  for (const demo of RESTAURANT_DEMO_PAGES) {
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
}
