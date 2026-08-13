import { defineCollection, f } from '@cogenta/schema'

/**
 * Three collections with deliberately different permission shapes, so the
 * matrix below proves the layer reads the collection instead of applying a
 * built-in idea of what an editor may do.
 */

/** Open to readers, written by editors, released by admins. Contract A's example. */
export const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
  },
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

/** Not readable by `public` at all: an intranet page behind a login. */
export const page = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  versioning: { drafts: true },
  fields: {
    title: f.text({ required: true }),
  },
  permissions: {
    read: ['viewer', 'editor', 'admin'],
    create: ['admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

/**
 * Written by anyone, and never "published" as an action: `publish` is absent on
 * purpose, which must deny it to every role rather than fall through to allowed.
 * `create: ['public']` is the trap — it must not become draft access.
 */
export const comment = defineCollection({
  name: 'comment',
  labels: { singular: 'Comment', plural: 'Comments' },
  fields: {
    body: f.text({ required: true, max: 2000 }),
  },
  permissions: {
    read: ['public'],
    create: ['public'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const COLLECTIONS = [article, page, comment]
