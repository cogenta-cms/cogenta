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
  toBlockZoneEntry,
} from './content-pack.js'

/**
 * The `association` blueprint's content model (L9 task 8, batch B): a
 * nonprofit's public site — an `event` collection (what a visitor comes
 * back to check), and two pages built around the mission and a call to
 * act (donate, volunteer, attend).
 */

export const event = defineCollection({
  name: 'event',
  labels: { singular: 'Event', plural: 'Events' },
  routing: { pattern: '/events/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    date: f.datetime({ required: true }),
    location: f.text({ max: 200 }),
    description: f.text({ max: 500, multiline: true }),
  },
  indexes: [['slug'], ['date']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const ASSOCIATION_COLLECTIONS: readonly CollectionDefinition[] = [event, page]

validateCollectionSet(ASSOCIATION_COLLECTIONS)

export interface AssociationDemoEvent {
  readonly title: string
  readonly slug: string
  readonly date: string
  readonly location: string
  readonly description: string
}

export const ASSOCIATION_DEMO_EVENTS: readonly AssociationDemoEvent[] = [
  {
    title: 'Community clean-up day',
    slug: 'community-clean-up-day',
    date: '2026-09-12T09:00:00.000Z',
    location: 'Riverside Park',
    description: 'A morning of volunteering, open to everyone, no experience needed.',
  },
  {
    title: 'Annual fundraising dinner',
    slug: 'annual-fundraising-dinner',
    date: '2026-10-03T18:30:00.000Z',
    location: 'Town Hall',
    description: "This year's proceeds go directly to the winter shelter programme.",
  },
  {
    title: 'Volunteer orientation',
    slug: 'volunteer-orientation',
    date: '2026-08-22T17:00:00.000Z',
    location: 'Community Centre, Room 2',
    description: 'A short session for anyone new to volunteering with us.',
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

export interface AssociationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + mission prose + a live list of upcoming events + a cta to
 * donate) and `mission` (a longer prose statement plus a static `stats`
 * summary of impact — the kind of number a nonprofit reports periodically,
 * not something to model as its own queryable collection).
 */
export const ASSOCIATION_DEMO_PAGES: readonly AssociationDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Association',
        title: 'Working together, close to home',
        subtitle:
          'Scaffolded by create-cogenta from the "association" blueprint, with real demo events already in place.',
      },
      proseParagraph(
        'demo-home-mission',
        'This is a demo nonprofit site, scaffolded by create-cogenta from the "association" blueprint. Its events and this page were seeded by the installer so there is real content to look at from the first run.',
      ),
      {
        _key: 'demo-home-events',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Upcoming events',
        collection: 'event',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 10,
        layout: 'list',
      },
      {
        _key: 'demo-home-cta',
        _type: 'cta',
        _version: BLOCK_VERSION,
        title: 'Help us do more',
        text: 'Every donation and every volunteer hour goes straight back into the community.',
        actions: [{ label: 'Donate', target: { href: '/mission' }, emphasis: 'primary' }],
      },
    ],
  },
  {
    title: 'Our mission',
    slug: 'mission',
    blocks: [
      proseParagraph(
        'demo-mission-prose',
        'Everything here — the schema, the content, the skin — is a normal part of the site and is meant to be edited, renamed or deleted the moment the defaults stop fitting.',
      ),
      {
        _key: 'demo-mission-stats',
        _type: 'stats',
        _version: BLOCK_VERSION,
        title: 'Our impact',
        items: [
          { _key: 'demo-stat-1', value: '12', unit: 'years', label: 'serving the community' },
          { _key: 'demo-stat-2', value: '340+', label: 'volunteers this year' },
          { _key: 'demo-stat-3', value: '60', label: 'families supported' },
        ],
      },
    ],
  },
]

export const ASSOCIATION_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift across event descriptions written by different volunteers.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits the mission and event pages so newcomers can find them from a search engine.',
  },
]

/**
 * Inserts the `association` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedAssociationDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const eventStore = createContentStore({ db, collection: event, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of ASSOCIATION_DEMO_EVENTS) {
    await eventStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        date: demo.date,
        location: demo.location,
        description: demo.description,
      },
    })
  }

  for (const demo of ASSOCIATION_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const associationContentPack: BlueprintContentPack = {
  collections: ASSOCIATION_COLLECTIONS,
  recommendedAgents: ASSOCIATION_RECOMMENDED_AGENTS,
  seedDemoContent: seedAssociationDemoContent,
}
