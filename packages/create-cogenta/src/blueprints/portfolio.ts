import type { VocabularyBlock } from '@cogenta/blocks'
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
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'

/**
 * The `portfolio` blueprint's content model (L9 task 8, batch A): a
 * freelance/creative portfolio — a `project` collection with its own
 * routed page, and two demo pages.
 */

export const project = defineCollection({
  name: 'project',
  labels: { singular: 'Project', plural: 'Projects' },
  routing: { pattern: '/work/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    summary: f.text({ max: 300, multiline: true }),
    role: f.text({ max: 120 }),
    year: f.text({ max: 4 }),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const PORTFOLIO_COLLECTIONS: readonly CollectionDefinition[] = [project, page]

validateCollectionSet(PORTFOLIO_COLLECTIONS)

export interface PortfolioDemoProject {
  readonly title: string
  readonly slug: string
  readonly summary: string
  readonly role: string
  readonly year: string
}

export const PORTFOLIO_DEMO_PROJECTS: readonly PortfolioDemoProject[] = [
  {
    title: 'Northwind rebrand',
    slug: 'northwind-rebrand',
    summary:
      'A full visual identity refresh for a regional grocery chain, from logotype to packaging.',
    role: 'Art direction',
    year: '2025',
  },
  {
    title: 'Contoso mobile app',
    slug: 'contoso-mobile-app',
    summary:
      'Interaction design and a component library for a fintech app used by two million people.',
    role: 'Product design',
    year: '2024',
  },
  {
    title: 'Fabrikam annual report',
    slug: 'fabrikam-annual-report',
    summary: 'Editorial design for a 60-page annual report, printed and interactive.',
    role: 'Editorial design',
    year: '2023',
  },
]

const BLOCK_VERSION = '1.0.0'

export interface PortfolioDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + a live grid of projects) and `about` (a short prose bio
 * plus a static `stats` summary — years of experience and projects
 * delivered are page-authored numbers, not something to model as a
 * separate queryable collection).
 */
export const PORTFOLIO_DEMO_PAGES: readonly PortfolioDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Portfolio',
        title: 'Selected work',
        subtitle:
          'Scaffolded by create-cogenta from the "portfolio" blueprint, with real demo projects already in place.',
      },
      {
        _key: 'demo-home-projects',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Projects',
        collection: 'project',
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 10,
        layout: 'grid',
      },
      {
        _key: 'demo-home-services',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'What I take on',
        items: [
          {
            _key: 'demo-service-1',
            icon: 'identity',
            title: 'Identity',
            text: 'Naming, marks and the small rules that keep a brand recognisable once other people apply it.',
          },
          {
            _key: 'demo-service-2',
            icon: 'editorial',
            title: 'Editorial design',
            text: 'Books, reports and long-form sites. Typography first, because that is where the reading happens.',
          },
          {
            _key: 'demo-service-3',
            icon: 'signage',
            title: 'Signage and print',
            text: 'Things that get made once and have to be right. Proofed on the material, not on a screen.',
          },
        ],
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    blocks: [
      {
        _key: 'demo-about-prose',
        _type: 'prose',
        _version: BLOCK_VERSION,
        body: [
          {
            _key: 'demo-about-p1',
            _type: 'block',
            style: 'normal',
            children: [
              {
                _key: 'demo-about-p1-span',
                _type: 'span',
                text: 'This is a demo portfolio, scaffolded by create-cogenta from the "portfolio" blueprint. Its projects and this page were seeded by the installer so there is real content to look at from the first run.',
                marks: [],
              },
            ],
            markDefs: [],
          },
        ],
      },
      {
        _key: 'demo-about-stats',
        _type: 'stats',
        _version: BLOCK_VERSION,
        title: 'At a glance',
        items: [
          { _key: 'demo-stat-1', value: '8', unit: 'years', label: 'in practice' },
          { _key: 'demo-stat-2', value: '40+', label: 'projects delivered' },
          { _key: 'demo-stat-3', value: '12', label: 'ongoing clients' },
        ],
      },
    ],
  },
]

export const PORTFOLIO_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized project cover images before they slow the work grid down.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits project pages so each one is findable on its own, not only from the grid.',
  },
]

/**
 * Inserts the `portfolio` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedPortfolioDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId } = ctx
  const projectStore = createContentStore({ db, collection: project, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of PORTFOLIO_DEMO_PROJECTS) {
    await projectStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        summary: demo.summary,
        role: demo.role,
        year: demo.year,
      },
    })
  }

  for (const demo of PORTFOLIO_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const portfolioContentPack: BlueprintContentPack = {
  collections: PORTFOLIO_COLLECTIONS,
  recommendedAgents: PORTFOLIO_RECOMMENDED_AGENTS,
  seedDemoContent: seedPortfolioDemoContent,
}
