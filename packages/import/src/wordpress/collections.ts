import {
  type CollectionDefinition,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'

/**
 * The content model a WordPress import writes into.
 *
 * Deliberately its own set, not a reuse of `create-cogenta`'s `blog`
 * blueprint collections: this import needs two fields the blueprint's `post`
 * does not declare — `publishedAt` (so the entry's real WordPress publish
 * date survives, rather than being overwritten by the system `createdAt`,
 * which is always "now") and `customFields` (`f.json()`, the only field kind
 * contract A offers with no fixed shape, for WordPress postmeta that has
 * nowhere semantic to go). Running this import against a site that already
 * has its own `post`/`category`/`tag`/`page` collections under those exact
 * names — e.g. one scaffolded from the `blog` blueprint — is out of scope for
 * this task: `createSchemaTables` only creates a table that does not exist
 * yet, so combining the two is not exercised or supported here.
 *
 * `body` is a block zone (`f.blocks()`), not a single `f.richText()` field
 * like the blueprint's `post.body`: WordPress content commonly mixes
 * paragraphs, images, quotes, galleries and embeds, and contract B already
 * has a semantic block for each of those (`prose`, `mediaFigure`, `quote`,
 * `gallery`, `embed`) — collapsing all of it into one rich-text field would
 * either lose the image/quote/embed structure or smuggle it through as
 * embedded HTML, which rule R3 forbids outright.
 */

export const wpCategory = defineCollection({
  name: 'category',
  labels: { singular: 'Category', plural: 'Categories' },
  routing: { pattern: '/blog/category/:slug' },
  fields: {
    name: f.text({ required: true, max: 200 }),
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

export const wpTag = defineCollection({
  name: 'tag',
  labels: { singular: 'Tag', plural: 'Tags' },
  fields: {
    name: f.text({ required: true, max: 200 }),
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

export const wpPost = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/blog/:slug' },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({ required: true, max: 300 }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 2000, multiline: true }),
    body: f.blocks({ allow: ['prose', 'mediaFigure', 'quote', 'gallery', 'embed'] }),
    publishedAt: f.datetime(),
    category: f.relation({ to: 'category', onDelete: 'setNull' }),
    tags: f.relation({ to: 'tag', many: true, onDelete: 'cascade' }),
    /** Opaque WordPress postmeta — contract A has no free-form field kind, so this is the honest carrier for it. */
    customFields: f.json(),
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

export const wpPage = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true, max: 300 }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.blocks({ allow: ['prose', 'mediaFigure', 'quote', 'gallery', 'embed'] }),
    publishedAt: f.datetime(),
    customFields: f.json(),
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
 * A minimal, real comment model — not a stub. WordPress comments have no
 * declared-user identity (a commenter is a name and an email, not an
 * account), so `author`/`authorEmail` are plain fields rather than a
 * `relation` to a user; `post` ties a comment back to the entry it belongs
 * to. Only fields the frozen field vocabulary (contract A) already offers
 * are used, the same discipline `create-cogenta`'s blueprints follow.
 */
export const wpComment = defineCollection({
  name: 'comment',
  labels: { singular: 'Comment', plural: 'Comments' },
  fields: {
    post: f.relation({ to: 'post', onDelete: 'cascade', required: true }),
    author: f.text({ required: true, max: 200 }),
    authorEmail: f.text({ max: 320 }),
    body: f.text({ required: true, multiline: true, max: 10000 }),
    publishedAt: f.datetime(),
  },
  permissions: {
    read: ['public'],
    create: ['public'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const WORDPRESS_IMPORT_COLLECTIONS: readonly CollectionDefinition[] = [
  wpPost,
  wpPage,
  wpCategory,
  wpTag,
  wpComment,
]

validateCollectionSet(WORDPRESS_IMPORT_COLLECTIONS)
