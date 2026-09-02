import type { VocabularyBlock } from '@cogenta/blocks'
import type { DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createTaxonomyStore,
  defineCollection,
  defineTaxonomy,
  f,
  type RichTextDocument,
  type TaxonomyDefinition,
  validateCollectionSet,
  validateTaxonomySet,
} from '@cogenta/schema'
import {
  type BlueprintContentPack,
  type RecommendedAgentHint,
  SEO_FIELDS,
  toBlockZoneEntry,
} from './content-pack.js'

/**
 * The `blog` blueprint's content model (L9 task 3).
 *
 * `post` reuses `SystemFields.status`/`createdAt` for publish state and
 * publish date rather than declaring its own — contract A already carries
 * both on every entry. Authorship reuses `SystemFields.createdBy`, which
 * points at the real user/actor system, rather than a separate author
 * collection this blueprint would have to invent and keep in sync.
 *
 * `category`/`tag` are `defineTaxonomy()` declarations, not collections
 * (audit fiche 04, T02/T10 — `schema@2.0`, ADR-0022, already figé; using it
 * here is a plain application of a frozen contract, not a new decision). A
 * blog post's category and tags are classification, not content: they have
 * no status, no version, no translation family of their own, which is
 * exactly what a taxonomy term already refuses to have and a collection
 * never did. `category` stays hierarchical (its default — a blog may want
 * "Guides > Tutorials" one day); `tag` is declared flat, matching the
 * "tags never nest" convention `defineTaxonomy`'s own doc comment names.
 */

export const category: TaxonomyDefinition = defineTaxonomy({
  name: 'category',
  labels: {
    singular: { en: 'Category', fr: 'Catégorie' },
    plural: { en: 'Categories', fr: 'Catégories' },
  },
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const tag: TaxonomyDefinition = defineTaxonomy({
  name: 'tag',
  labels: {
    singular: { en: 'Tag', fr: 'Étiquette' },
    plural: { en: 'Tags', fr: 'Étiquettes' },
  },
  hierarchical: false,
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const post = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/blog/:slug' },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    // `body` before `excerpt` (fiche 44 task 1): the editor reads and writes
    // the excerpt *from* the body, so the form now shows them in that same
    // order — the excerpt field used to render first, above the text it
    // summarises. Purely a blueprint ordering choice, not contract A: field
    // declaration order has no meaning to `@cogenta/schema` beyond "the order
    // `EntryForm` renders them in".
    body: f.richText({ required: true }),
    excerpt: f.text({ max: 300, multiline: true }),
    coverImage: f.media({ accept: ['image'] }),
    category: f.taxonomy({ of: 'category', many: false }),
    tags: f.taxonomy({ of: 'tag', many: true }),
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

/**
 * The blueprint's "page types" (L9 task 4): standalone pages composed of
 * vocabulary blocks rather than a bespoke template each — the same
 * title-plus-block-zone shape `theme-canonical`'s own test fixtures already
 * use for `{ collection: 'page', id: … }` internal-link targets, formalised
 * here as a real `CollectionDefinition` for the first time. `blocks` uses
 * `f.blocks()` (contract A), the field kind a `BlockZone` — an ordered list of
 * vocabulary blocks — is stored under; `renderPage` (`@cogenta/theme-canonical`)
 * takes exactly a title plus that list.
 */
export const page = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    blocks: f.blocks({ required: true }),
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

/**
 * Also the export written into the scaffolded site's `cogenta.schema.mjs`
 * (`scaffold.ts`), so `loadCollections` (`@cogenta/cli`) reads back exactly
 * these two collections — `category`/`tag` are no longer collections
 * (`BLOG_TAXONOMIES` below), so they no longer belong in this list.
 */
export const BLOG_COLLECTIONS: readonly CollectionDefinition[] = [post, page]

/**
 * The blueprint's declared taxonomies, written into the scaffolded site's
 * `cogenta.schema.mjs` as its named `taxonomies` export (`loadCollections`,
 * `@cogenta/cli`, reads exactly that name).
 */
export const BLOG_TAXONOMIES: readonly TaxonomyDefinition[] = [category, tag]

// Cross-collection checks (duplicate names, dangling relation targets) run
// at import time, same as `defineCollection` itself: a mistake here costs a
// restart, not a database.
validateCollectionSet(BLOG_COLLECTIONS)
// Same idea for taxonomy fields (`post.category`/`post.tags`): a `f.taxonomy`
// pointing at an undeclared taxonomy is caught here, not the first time a
// site tries to save a post.
validateTaxonomySet(BLOG_TAXONOMIES, BLOG_COLLECTIONS)

export interface BlogDemoCategory {
  readonly name: string
  readonly slug: string
}

export interface BlogDemoTag {
  readonly name: string
  readonly slug: string
}

export interface BlogDemoPost {
  readonly title: string
  readonly slug: string
  readonly excerpt: string
  readonly body: RichTextDocument
  readonly categorySlug: string
  readonly tagSlugs: readonly string[]
}

let paragraphKey = 0

/** One `normal`-style rich-text paragraph, unmarked. */
function paragraph(text: string): RichTextDocument[number] {
  paragraphKey += 1
  return {
    _key: `demo-${paragraphKey}`,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `demo-${paragraphKey}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

export const BLOG_DEMO_CATEGORIES: readonly BlogDemoCategory[] = [
  { name: 'Announcements', slug: 'announcements' },
  { name: 'Guides', slug: 'guides' },
]

export const BLOG_DEMO_TAGS: readonly BlogDemoTag[] = [
  { name: 'cms', slug: 'cms' },
  { name: 'open source', slug: 'open-source' },
  { name: 'agents', slug: 'agents' },
]

export const BLOG_DEMO_POSTS: readonly BlogDemoPost[] = [
  {
    title: 'Welcome to Cogenta',
    slug: 'welcome-to-cogenta',
    excerpt:
      'Cogenta is an open-source, agentic CMS: a site that monitors, patches and optimises itself, and reports what it did.',
    body: [
      paragraph(
        'Cogenta is a content management system built around a simple idea: a site should be able to run ' +
          'itself. Under the hood it is a normal, dependable CMS — content types, drafts, versioning, media, ' +
          'multi-locale entries — with an agent runtime as a first-class part of the core rather than a ' +
          'bolted-on plugin.',
      ),
      paragraph(
        'This post, and this blog, were scaffolded by create-cogenta as part of the "blog" blueprint: a ready ' +
          'content model, a skin, and a few real demo posts to look at instead of an empty admin screen.',
      ),
    ],
    categorySlug: 'announcements',
    tagSlugs: ['cms', 'open-source'],
  },
  {
    title: 'What a blueprint actually gives you',
    slug: 'what-a-blueprint-gives-you',
    excerpt:
      'A blueprint is not a theme. It is a content model, a skin, recommended agents and demo content, all at once — and every part of it can still be changed afterwards.',
    body: [
      paragraph(
        'Picking the "blog" blueprint during setup creates three collections — post, category and tag — wires ' +
          "up routing for a post list, a post page and a category archive, and applies the canonical theme's " +
          'default skin.',
      ),
      paragraph(
        'None of that is a cage. The schema is a normal cogenta.schema.mjs file, the skin is a normal ' +
          'tokens.json, and both are meant to be edited the moment the defaults stop fitting.',
      ),
    ],
    categorySlug: 'guides',
    tagSlugs: ['cms'],
  },
  {
    title: 'Agents recommended for a blog',
    slug: 'agents-recommended-for-a-blog',
    excerpt:
      'The blog blueprint names two agents worth turning on — it does not turn them on for you.',
    body: [
      paragraph(
        'No site in Cogenta runs a live agent scheduler by default (R2: the CMS works with zero AI configured). ' +
          'What the "blog" blueprint does instead is record a recommendation: seoAgent and contentAgent, both ' +
          'shipped in @cogenta/agents-builtin, are a reasonable pair to enable for a content-heavy site once an ' +
          'LLM provider is configured.',
      ),
      paragraph(
        'Turning them on is a deliberate, separate step — not something a scaffold should decide on your behalf.',
      ),
    ],
    categorySlug: 'guides',
    tagSlugs: ['agents', 'open-source'],
  },
]

export interface BlogDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

const BLOCK_VERSION = '1.0.0'

/**
 * `home` and `about` — the two demo pages a freshly scaffolded blog needs so
 * its front page is not the empty admin screen. `home` pairs a `hero` with a
 * `collectionList` scoped to `post`, both part of the frozen block vocabulary
 * (contract B) and both already rendered generically by
 * `@cogenta/theme-canonical`'s `renderPage`/`renderBlock` — no bespoke
 * "home page" or "about page" template is needed for either.
 */
export const BLOG_DEMO_PAGES: readonly BlogDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Cogenta',
        title: 'A blog that runs itself',
        subtitle:
          'Scaffolded by create-cogenta with real demo posts, categories and tags — every one of them editable the moment you sign in.',
        actions: [
          {
            label: 'Read the latest post',
            target: { href: '/blog/welcome-to-cogenta' },
            emphasis: 'primary',
          },
        ],
      },
      {
        _key: 'demo-home-recent-posts',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Latest posts',
        collection: 'post',
        // `publishedAt` is nullable (a draft has none) and was never in the
        // real, frozen `SortField` union (`id`/`createdAt`/`updatedAt` only —
        // cursor pagination needs a column that is never null). This block
        // asked for it anyway and nothing exercised the query until
        // `cogenta serve`'s theme-render fallback did, surfacing a real
        // QUERY_INVALID on every request for the seeded home page.
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 10,
        layout: 'list',
      },
      {
        _key: 'demo-home-what',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'What you are looking at',
        items: [
          {
            _key: 'demo-what-1',
            icon: 'blocks',
            title: 'Blocks, not HTML',
            text: 'Every section of this page is a block storing plain data. The theme decides what it looks like, so a new skin restyles all of it at once.',
          },
          {
            _key: 'demo-what-2',
            icon: 'content',
            title: 'Real content, from the first run',
            text: 'The posts, categories and tags below were seeded by the installer. Rename them, delete them — nothing here is special.',
          },
          {
            _key: 'demo-what-3',
            icon: 'zero-js',
            title: 'No client JavaScript',
            text: 'The accordion, the carousel and the dark mode are all CSS. There is no bundle to wait for on a slow connection.',
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
          paragraph(
            'This is a demo blog, scaffolded by create-cogenta from the "blog" blueprint. Its posts, ' +
              'categories, tags and this very page were seeded by the installer so there is real content to ' +
              'look at from the first run, not an empty admin screen.',
          ),
          paragraph(
            'Everything here — the schema, the content, the skin — is a normal part of the site and is meant ' +
              'to be edited, renamed or deleted the moment the defaults stop fitting.',
          ),
        ],
      },
    ],
  },
]

export const BLOG_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits published posts for on-page SEO issues and internal-linking gaps.',
  },
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift and topic gaps across the post archive.',
  },
]

/**
 * Inserts the `blog` blueprint's demo content through the real `ContentStore`
 * — never mocked (house rule) — so a scaffolded blog blueprint has genuine
 * rows to look at, not a claim that it does.
 */
async function seedBlogDemoContent(
  db: DatabaseHandle,
  defaultLocale: string,
  adminId: string | null,
): Promise<void> {
  // `category`/`tag` are taxonomies, not collections (T02, ADR-0022) — their
  // demo terms go through `TaxonomyStore`, not `createContentStore`.
  const categoryStore = createTaxonomyStore({ db, taxonomy: category })
  const tagStore = createTaxonomyStore({ db, taxonomy: tag })
  const postStore = createContentStore({ db, collection: post, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const categoryIdBySlug = new Map<string, string>()
  for (const demo of BLOG_DEMO_CATEGORIES) {
    const term = await categoryStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    categoryIdBySlug.set(demo.slug, term.id)
  }

  const tagIdBySlug = new Map<string, string>()
  for (const demo of BLOG_DEMO_TAGS) {
    const term = await tagStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    tagIdBySlug.set(demo.slug, term.id)
  }

  for (const demo of BLOG_DEMO_POSTS) {
    await postStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        body: demo.body,
        category: categoryIdBySlug.get(demo.categorySlug) ?? null,
        tags: demo.tagSlugs.map((slug) => tagIdBySlug.get(slug)).filter((id) => id !== undefined),
      },
    })
  }

  for (const demo of BLOG_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const blogContentPack: BlueprintContentPack = {
  collections: BLOG_COLLECTIONS,
  taxonomies: BLOG_TAXONOMIES,
  recommendedAgents: BLOG_RECOMMENDED_AGENTS,
  seedDemoContent: seedBlogDemoContent,
}
