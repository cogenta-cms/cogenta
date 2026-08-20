import type { ContentEntry, ContentStatus } from '@cogenta/schema'
import { defineCollection, f } from '@cogenta/schema'
import type { SeoResource, SeoSite } from '../src/types.js'

/**
 * Three collection shapes, on purpose.
 *
 * `article` is contract A's own example and must derive an `Article`; `page` has
 * prose but no publication date and must derive a `WebPage`; `author` has no
 * route at all and must derive a `Person` while producing no URL. Between them
 * they cover every branch of the type derivation and of the "has a URL" gate.
 */

export const articleCollection = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({ required: true, max: 200, localized: true }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 320, localized: true }),
    body: f.richText({ localized: true }),
    cover: f.media({ accept: ['image'], required: true }),
    author: f.relation({ to: 'author', required: true, onDelete: 'restrict' }),
    tags: f.relation({ to: 'tag', many: true }),
    publishedAt: f.datetime(),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

export const pageCollection = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title', unique: true }),
    description: f.text({ max: 320 }),
    body: f.richText(),
  },
  permissions: { read: ['public'] },
})

/**
 * Fiche 13 (SEO éditorial), Task 0 § decision (a): the five conventional SEO
 * override fields, declared exactly as a real blueprint would declare them —
 * ordinary fields, no contract A change. Kept separate from `articleCollection`
 * above so every existing fixture and test keeps exercising the "collection
 * declares none of this" path unchanged.
 */
export const seoArticleCollection = defineCollection({
  name: 'seo_article',
  labels: { singular: 'SEO article', plural: 'SEO articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({ required: true, max: 200, localized: true }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 320, localized: true }),
    body: f.richText({ localized: true }),
    cover: f.media({ accept: ['image'], required: true }),
    publishedAt: f.datetime(),
    seoTitle: f.text({ max: 300, localized: true }),
    seoDescription: f.text({ max: 400, localized: true }),
    seoImage: f.media({ accept: ['image'] }),
    seoNoindex: f.boolean({ default: false }),
    seoCanonical: f.text({ max: 500, localized: true }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

export const authorCollection = defineCollection({
  name: 'author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: {
    name: f.text({ required: true }),
    bio: f.text(),
  },
  permissions: { read: ['public'] },
})

export const site: SeoSite = {
  baseUrl: 'https://example.com',
  name: 'Example',
  description: 'A site that exists to be crawled.',
  defaultLocale: 'en',
  locales: ['en', 'fr', 'de'],
  twitterSite: '@example',
}

export interface EntryOverrides {
  readonly id?: string
  readonly locale?: string
  readonly translationOf?: string | null
  readonly status?: ContentStatus
  readonly state?: 'published' | 'working'
  readonly publishedAt?: string | null
  readonly updatedAt?: string
  readonly values?: Readonly<Record<string, unknown>>
}

let counter = 0

/** A published entry by default: the tests that matter opt *out* of publication. */
export function makeEntry(overrides: EntryOverrides = {}): ContentEntry {
  counter += 1
  const id = overrides.id ?? `0192f3a1-0000-7000-8000-${String(counter).padStart(12, '0')}`
  const status = overrides.status ?? 'published'

  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-02-01T12:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    status,
    // `schema@2.0`: never in the trash here. A trashed entry has no business
    // in a sitemap or a canonical tag at all — the store filters it out long
    // before SEO sees it (ADR-0022).
    deletedAt: null,
    reviewState: 'none',
    assignedReviewer: null,
    locale: overrides.locale ?? 'en',
    translationOf: overrides.translationOf ?? null,
    version: 1,
    provenance: 'human',
    provenanceDetail: null,
    publishedAt:
      overrides.publishedAt === undefined
        ? status === 'published'
          ? '2026-01-15T09:00:00.000Z'
          : null
        : overrides.publishedAt,
    state: overrides.state ?? 'published',
    values: overrides.values ?? {},
    blocks: {},
  }
}

export function makeArticle(overrides: EntryOverrides = {}): SeoResource {
  return {
    collection: articleCollection,
    entry: makeEntry({
      ...overrides,
      values: {
        title: 'Hello world',
        slug: 'hello-world',
        excerpt: 'A short summary.',
        ...overrides.values,
      },
    }),
  }
}

export function makeSeoArticle(overrides: EntryOverrides = {}): SeoResource {
  return {
    collection: seoArticleCollection,
    entry: makeEntry({
      ...overrides,
      values: {
        title: 'Hello world',
        slug: 'hello-world',
        excerpt: 'A short summary.',
        ...overrides.values,
      },
    }),
  }
}

export function makePage(overrides: EntryOverrides = {}): SeoResource {
  return {
    collection: pageCollection,
    entry: makeEntry({
      ...overrides,
      values: { title: 'About', slug: 'about', description: 'Who we are.', ...overrides.values },
    }),
  }
}

export function makeAuthor(overrides: EntryOverrides = {}): SeoResource {
  return {
    collection: authorCollection,
    entry: makeEntry({
      ...overrides,
      values: { name: 'Ada Lovelace', bio: 'Wrote the first program.', ...overrides.values },
    }),
  }
}
