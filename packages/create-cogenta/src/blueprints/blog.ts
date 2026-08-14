import {
  type CollectionDefinition,
  defineCollection,
  f,
  type RichTextDocument,
  validateCollectionSet,
} from '@cogenta/schema'

/**
 * The `blog` blueprint's content model (L9 task 3).
 *
 * `post` reuses `SystemFields.status`/`createdAt` for publish state and
 * publish date rather than declaring its own — contract A already carries
 * both on every entry. Authorship reuses `SystemFields.createdBy`, which
 * points at the real user/actor system, rather than a separate author
 * collection this blueprint would have to invent and keep in sync.
 */

export const category = defineCollection({
  name: 'category',
  labels: { singular: 'Category', plural: 'Categories' },
  routing: { pattern: '/blog/category/:slug' },
  fields: {
    name: f.text({ required: true, max: 80 }),
    slug: f.slug({ from: 'name', unique: true }),
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const tag = defineCollection({
  name: 'tag',
  labels: { singular: 'Tag', plural: 'Tags' },
  fields: {
    name: f.text({ required: true, max: 40 }),
    slug: f.slug({ from: 'name', unique: true }),
  },
  indexes: [['slug']],
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
    excerpt: f.text({ max: 300, multiline: true }),
    body: f.richText({ required: true }),
    coverImage: f.media({ accept: ['image'] }),
    category: f.relation({ to: 'category', onDelete: 'setNull' }),
    tags: f.relation({ to: 'tag', many: true, onDelete: 'cascade' }),
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
 * Also the export written into the scaffolded site's `cogenta.schema.mjs`
 * (`scaffold.ts`), so `loadCollections` (`@cogenta/cli`) reads back exactly
 * these three collections.
 */
export const BLOG_COLLECTIONS: readonly CollectionDefinition[] = [post, category, tag]

// Cross-collection checks (duplicate names, dangling relation targets) run
// at import time, same as `defineCollection` itself: a mistake here costs a
// restart, not a database.
validateCollectionSet(BLOG_COLLECTIONS)

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

export interface RecommendedAgentHint {
  readonly name: string
  readonly package: string
  readonly reason: string
}

/**
 * Names, and does not wire, the agents this blueprint recommends.
 *
 * No site anywhere in this codebase constructs a live `AgentRegistry` yet
 * (see `Site.agentsRouter` in `@cogenta/cli`'s `serve.ts`) — R2 requires the
 * CMS to work with no AI provider configured at all. Pretending to schedule
 * these agents from the installer would be dishonest about what actually
 * runs; naming them here is the scoped, truthful version of "agents
 * préconfigurés" until a live scheduler exists somewhere to preconfigure.
 */
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
