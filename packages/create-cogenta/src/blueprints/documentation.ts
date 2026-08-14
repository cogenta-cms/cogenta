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
 * The `documentation` blueprint's content model (L9 task 8, batch A):
 * reference material, not marketing — the "pages types" are `docPage`
 * entries themselves (ordered, grouped into sections), rather than a
 * generic block-composed page for each one. A single `page` entry (`home`)
 * still exists so the site root works and links into the docs, exactly
 * like every other blueprint's landing page.
 */

export const docPage = defineCollection({
  name: 'doc_page',
  labels: { singular: 'Doc page', plural: 'Doc pages' },
  routing: { pattern: '/docs/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    section: f.text({ required: true, max: 80 }),
    order: f.number({ required: true, integer: true, min: 0 }),
    body: f.blocks({ required: true }),
  },
  indexes: [['slug'], ['section']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const DOCUMENTATION_COLLECTIONS: readonly CollectionDefinition[] = [docPage, page]

validateCollectionSet(DOCUMENTATION_COLLECTIONS)

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

export interface DocumentationDemoDocPage {
  readonly title: string
  readonly slug: string
  readonly section: string
  readonly order: number
  readonly body: readonly VocabularyBlock[]
}

export const DOCUMENTATION_DEMO_DOC_PAGES: readonly DocumentationDemoDocPage[] = [
  {
    title: 'Getting started',
    slug: 'getting-started',
    section: 'Guides',
    order: 1,
    body: [
      proseParagraph(
        'demo-doc-getting-started',
        'This is a demo documentation site, scaffolded by create-cogenta from the "documentation" blueprint. Each doc page below was seeded by the installer so there is real content to look at from the first run.',
      ),
    ],
  },
  {
    title: 'Configuration',
    slug: 'configuration',
    section: 'Guides',
    order: 2,
    body: [
      proseParagraph(
        'demo-doc-configuration',
        'Doc pages are ordered within a section by the "order" field, and grouped by "section" — both normal, editable fields, not fixed navigation.',
      ),
    ],
  },
  {
    title: 'API reference',
    slug: 'api-reference',
    section: 'Reference',
    order: 1,
    body: [
      proseParagraph(
        'demo-doc-api-reference',
        'A separate section from the guides above, so a docs site can hold both narrative and reference material without one crowding out the other.',
      ),
    ],
  },
]

export interface DocumentationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

export const DOCUMENTATION_DEMO_PAGES: readonly DocumentationDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Documentation',
        title: 'Everything documented, nothing hidden',
        subtitle:
          'Scaffolded by create-cogenta from the "documentation" blueprint, with real demo doc pages already in place.',
        actions: [
          {
            label: 'Start reading',
            target: { href: '/docs/getting-started' },
            emphasis: 'primary',
          },
        ],
      },
      {
        _key: 'demo-home-docs',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Doc pages',
        collection: 'doc_page',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 20,
        layout: 'list',
      },
    ],
  },
]

export const DOCUMENTATION_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift across doc pages, where consistent wording matters most.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits internal linking between doc pages so readers can navigate without the sidebar.',
  },
]

/**
 * Inserts the `documentation` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedDocumentationDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const docPageStore = createContentStore({ db, collection: docPage, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of DOCUMENTATION_DEMO_DOC_PAGES) {
    await docPageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug, section: demo.section, order: demo.order },
      blocks: { body: demo.body.map(toBlockZoneEntry) },
    })
  }

  for (const demo of DOCUMENTATION_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const documentationContentPack: BlueprintContentPack = {
  collections: DOCUMENTATION_COLLECTIONS,
  recommendedAgents: DOCUMENTATION_RECOMMENDED_AGENTS,
  seedDemoContent: seedDocumentationDemoContent,
}
