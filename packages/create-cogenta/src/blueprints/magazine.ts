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
 * The `magazine` blueprint's content model (L9 task 8, batch B): editorial
 * content grouped into sections — one collection (`article`), one grouping
 * field (`section`), rather than a separate category collection on top of
 * it (`blog` already covers the "posts plus a real category collection"
 * shape; a magazine's twist is section-grouped editorial, not another
 * taxonomy).
 */

export const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/articles/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 300, multiline: true }),
    section: f.select({ options: ['News', 'Culture', 'Opinion'], required: true }),
    body: f.blocks({ required: true }),
  },
  indexes: [['slug'], ['section']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const MAGAZINE_COLLECTIONS: readonly CollectionDefinition[] = [article, page]

validateCollectionSet(MAGAZINE_COLLECTIONS)

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

export interface MagazineDemoArticle {
  readonly title: string
  readonly slug: string
  readonly excerpt: string
  readonly section: 'News' | 'Culture' | 'Opinion'
  readonly body: readonly VocabularyBlock[]
}

export const MAGAZINE_DEMO_ARTICLES: readonly MagazineDemoArticle[] = [
  {
    title: 'A new season, a new lineup',
    slug: 'a-new-season-a-new-lineup',
    excerpt: 'What changed this quarter, and why it matters to readers.',
    section: 'News',
    body: [
      proseParagraph(
        'demo-article-1-p1',
        'This is a demo magazine, scaffolded by create-cogenta from the "magazine" blueprint. Its articles were seeded by the installer so there is real content to look at from the first run.',
      ),
    ],
  },
  {
    title: 'Three exhibitions worth the trip',
    slug: 'three-exhibitions-worth-the-trip',
    excerpt: 'A short, opinionated guide to what is showing this month.',
    section: 'Culture',
    body: [
      proseParagraph(
        'demo-article-2-p1',
        'Articles are grouped by "section", a normal editable field, not a fixed navigation menu.',
      ),
    ],
  },
  {
    title: 'Why the small stories matter most',
    slug: 'why-the-small-stories-matter-most',
    excerpt: "An editor's take on what gets left out of the bigger headlines.",
    section: 'Opinion',
    body: [
      proseParagraph(
        'demo-article-3-p1',
        'Everything here — the schema, the content, the skin — is a normal part of the site and is meant to be edited, renamed or deleted the moment the defaults stop fitting.',
      ),
    ],
  },
]

export interface MagazineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + a live list of recent articles) and `about` (a short prose
 * masthead note).
 */
export const MAGAZINE_DEMO_PAGES: readonly MagazineDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Magazine',
        title: 'Stories worth your time',
        subtitle:
          'Scaffolded by create-cogenta from the "magazine" blueprint, with real demo articles already in place.',
      },
      {
        _key: 'demo-home-articles',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Latest articles',
        collection: 'article',
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 10,
        layout: 'list',
      },
      {
        _key: 'demo-home-sections',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'What we cover',
        items: [
          {
            _key: 'demo-section-1',
            icon: 'city',
            title: 'The city',
            text: 'Housing, transport and the decisions taken in rooms nobody reports from.',
          },
          {
            _key: 'demo-section-2',
            icon: 'work',
            title: 'Work',
            text: 'What people here actually do all day, and what it pays. Long interviews, few numbers.',
          },
          {
            _key: 'demo-section-3',
            icon: 'culture',
            title: 'Culture',
            text: 'Reviews written by people who paid for the ticket, and profiles of the ones who made it.',
          },
        ],
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    blocks: [
      proseParagraph(
        'demo-about-prose',
        'This is a demo magazine, scaffolded by create-cogenta from the "magazine" blueprint. Its articles and this page were seeded by the installer so there is real content to look at from the first run.',
      ),
      {
        _key: 'demo-about-quote',
        _type: 'quote',
        _version: BLOCK_VERSION,
        text: 'A magazine is a promise about what you will not have to read: everything we decided was not worth your evening.',
        author: 'Noor Hassani',
        role: 'Editor',
      },
    ],
  },
]

export const MAGAZINE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift and topic gaps across sections written by different editors.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits published articles for on-page SEO issues and internal-linking gaps.',
  },
]

/**
 * Inserts the `magazine` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedMagazineDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  const articleStore = createContentStore({ db, collection: article, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of MAGAZINE_DEMO_ARTICLES) {
    await articleStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        section: demo.section,
      },
      blocks: { body: demo.body.map(toBlockZoneEntry) },
    })
  }

  for (const demo of MAGAZINE_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const magazineContentPack: BlueprintContentPack = {
  collections: MAGAZINE_COLLECTIONS,
  recommendedAgents: MAGAZINE_RECOMMENDED_AGENTS,
  seedDemoContent: seedMagazineDemoContent,
}
