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
 * The `saas` blueprint's content model (L9 task 8, batch B): a marketing
 * site for a software product — a `feature` collection routed so it can be
 * listed live on the home page, exactly like `vitrine`'s `service`.
 * Deliberately no `pricingPlan` collection or billing model: pricing tiers
 * on a real SaaS site are usually a handful of numbers with no independent
 * lifecycle (no author, no publish date, no individual page), so they are
 * page-authored content on the `pricing` page below rather than a second
 * collection invented to hold three rows.
 */

export const feature = defineCollection({
  name: 'feature',
  labels: { singular: 'Feature', plural: 'Features' },
  routing: { pattern: '/features/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 300, multiline: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const SAAS_COLLECTIONS: readonly CollectionDefinition[] = [feature, page]

validateCollectionSet(SAAS_COLLECTIONS)

export interface SaasDemoFeature {
  readonly name: string
  readonly slug: string
  readonly description: string
}

export const SAAS_DEMO_FEATURES: readonly SaasDemoFeature[] = [
  {
    name: 'Real-time collaboration',
    slug: 'real-time-collaboration',
    description: 'Everyone on the team sees the same state, updated the instant it changes.',
  },
  {
    name: 'One-click integrations',
    slug: 'one-click-integrations',
    description: 'Connect the tools already in use without a single line of code.',
  },
  {
    name: 'Audit trail built in',
    slug: 'audit-trail-built-in',
    description: 'Every change is logged, diffed and reversible — nothing happens silently.',
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

export interface SaasDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + a live list of features + a cta to sign up) and `pricing`
 * (a short prose intro plus a static `stats` row — the page-authored
 * numbers a pricing page usually leads with, not a full billing model).
 */
export const SAAS_DEMO_PAGES: readonly SaasDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'SaaS',
        title: 'Ship faster, with less friction',
        subtitle:
          'Scaffolded by create-cogenta from the "saas" blueprint, with real demo features already in place.',
        actions: [{ label: 'Start free trial', target: { href: '/pricing' }, emphasis: 'primary' }],
      },
      {
        _key: 'demo-home-features',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Features',
        collection: 'feature',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 10,
        layout: 'grid',
      },
      {
        _key: 'demo-home-why',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'Why teams move here',
        items: [
          {
            _key: 'demo-why-1',
            icon: 'bolt',
            title: 'Set up in an afternoon',
            text: 'Import what you already have, invite the team, and keep working. Nothing to migrate first.',
          },
          {
            _key: 'demo-why-2',
            icon: 'lock',
            title: 'Your data stays yours',
            text: 'A full export in one click, in a format something else can actually read. No lock-in by file format.',
          },
          {
            _key: 'demo-why-3',
            icon: 'chart',
            title: 'Priced by what you use',
            text: 'One plan, billed on active seats. Nobody pays for the colleague who logs in twice a year.',
          },
        ],
      },
      {
        _key: 'demo-home-cta',
        _type: 'cta',
        _version: BLOCK_VERSION,
        title: 'Ready to try it?',
        text: 'No credit card required for the trial. Every feature above is normal editable content.',
        actions: [{ label: 'See pricing', target: { href: '/pricing' }, emphasis: 'primary' }],
      },
    ],
  },
  {
    title: 'Pricing',
    slug: 'pricing',
    blocks: [
      proseParagraph(
        'demo-pricing-prose',
        'This is a demo SaaS site, scaffolded by create-cogenta from the "saas" blueprint. Its features and this page were seeded by the installer so there is real content to look at from the first run.',
      ),
      {
        _key: 'demo-pricing-stats',
        _type: 'stats',
        _version: BLOCK_VERSION,
        title: 'Trusted at scale',
        items: [
          { _key: 'demo-stat-1', value: '4.8', unit: '/5', label: 'average rating' },
          { _key: 'demo-stat-2', value: '99.9', unit: '%', label: 'uptime' },
          { _key: 'demo-stat-3', value: '2,400+', label: 'teams onboarded' },
        ],
      },
      {
        _key: 'demo-pricing-faq',
        _type: 'faq',
        _version: BLOCK_VERSION,
        title: 'Questions about billing',
        items: [
          {
            _key: 'demo-pricing-faq-1',
            question: 'What happens when the trial ends?',
            answer: richTextParagraph(
              'demo-pricing-faq-1-a',
              'The workspace goes read-only rather than being deleted. Everything is still there, and still exportable, whether you subscribe that week or six months later.',
            ),
          },
          {
            _key: 'demo-pricing-faq-2',
            question: 'Do you charge for people who barely log in?',
            answer: richTextParagraph(
              'demo-pricing-faq-2-a',
              'No. A seat counts in a month only if it was actually used that month, and the invoice shows which ones did.',
            ),
          },
          {
            _key: 'demo-pricing-faq-3',
            question: 'Can we pay by invoice instead of card?',
            answer: richTextParagraph(
              'demo-pricing-faq-3-a',
              'From five seats up, yearly, on thirty-day terms. Below that the card flow costs everyone less than the paperwork would.',
            ),
          },
        ],
      },
    ],
  },
]

export const SAAS_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches regressions on the marketing pages that most directly drive sign-ups.',
  },
  {
    name: 'securityAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Tracks dependency vulnerabilities — the kind of thing a SaaS buyer asks about first.',
  },
]

/**
 * Inserts the `saas` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedSaasDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const featureStore = createContentStore({ db, collection: feature, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of SAAS_DEMO_FEATURES) {
    await featureStore.create({
      status: 'published',
      createdBy: adminId,
      values: { name: demo.name, slug: demo.slug, description: demo.description },
    })
  }

  for (const demo of SAAS_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const saasContentPack: BlueprintContentPack = {
  collections: SAAS_COLLECTIONS,
  recommendedAgents: SAAS_RECOMMENDED_AGENTS,
  seedDemoContent: seedSaasDemoContent,
}
