import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findMediaUsage } from '../src/media-usage.js'
import type { ContentStore } from '../src/store/store.js'
import { createContentStore } from '../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../src/store/tables.js'
import type { CollectionDefinition } from '../src/types.js'

/**
 * A real SQLite store, the same shape `links/check.test.ts` uses for
 * `checkLinks` — the whole point of "where is this media used?" is what it
 * reports about content that genuinely exists.
 */
const article: CollectionDefinition = {
  name: 'usage_article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
    // `many: true` on a `media` field is not backed by a join table the way
    // it is for `relation`/`taxonomy` — `columnTypeFor`/`isColumnless`
    // (`store/columns.ts`) route only those two kinds through one. A
    // pre-existing gap outside this fiche's scope, not something this test
    // works around by pretending it stores an array.
    cover: { kind: 'media', options: { accept: ['image'], many: false } },
    body: { kind: 'blocks', options: { allow: [] } },
  },
  permissions: { read: ['public'] },
}

const author: CollectionDefinition = {
  name: 'usage_author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: {
    name: { kind: 'text', required: true, options: { max: 200 } },
    portrait: { kind: 'media', options: { accept: ['image'], many: false } },
  },
  permissions: { read: ['public'] },
}

describe('findMediaUsage', () => {
  let directory: string
  let db: DatabaseHandle
  let articleStore: ContentStore
  let authorStore: ContentStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-media-usage-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [article, author])
    articleStore = createContentStore({ db, collection: article, siblings: [article, author] })
    authorStore = createContentStore({ db, collection: author, siblings: [article, author] })
  })

  afterEach(async () => {
    await dropSchemaTables(db, [article, author])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  function storeFor(collection: CollectionDefinition): ContentStore {
    if (collection.name === article.name) return articleStore
    if (collection.name === author.name) return authorStore
    throw new Error(`no store wired for ${collection.name}`)
  }

  it('finds a single media field, a many-valued one and a block reference, and names where each is', async () => {
    await articleStore.create({
      values: {
        title: 'Hello',
        slug: 'hello',
        cover: 'media-cover',
      },
      blocks: {
        body: [
          {
            key: 'b1',
            type: 'mediaFigure',
            data: { media: 'media-in-block', extras: ['media-in-array-1', 'media-in-array-2'] },
          },
        ],
      } as never,
    })

    const coverUsage = await findMediaUsage('media-cover', { collections: [article], storeFor })
    expect(coverUsage.matches).toHaveLength(1)
    expect(coverUsage.matches[0]).toMatchObject({ collection: 'usage_article', at: 'cover' })

    const blockUsage = await findMediaUsage('media-in-block', {
      collections: [article],
      storeFor,
    })
    expect(blockUsage.matches).toHaveLength(1)
    expect(blockUsage.matches[0]).toMatchObject({
      collection: 'usage_article',
      at: 'blocks.body[0].mediaFigure',
    })

    // A reference nested inside an array within a block's data — the
    // fixture `@cogenta/blocks` gives a `gallery` block, for instance —
    // is found the same way, since the walk recurses into arrays too.
    const arrayUsage = await findMediaUsage('media-in-array-2', {
      collections: [article],
      storeFor,
    })
    expect(arrayUsage.matches).toHaveLength(1)
    expect(arrayUsage.matches[0]).toMatchObject({
      collection: 'usage_article',
      at: 'blocks.body[0].mediaFigure',
    })
  })

  it('reports nothing for a media id no entry references', async () => {
    await articleStore.create({ values: { title: 'Hello', slug: 'hello', cover: 'used' } })

    const report = await findMediaUsage('never-referenced', { collections: [article], storeFor })
    expect(report.matches).toEqual([])
    expect(report.scannedEntries).toBe(1)
    expect(report.truncated).toBe(false)
  })

  it('does not match a substring — only an exact reference counts', async () => {
    await articleStore.create({
      values: { title: 'Hello', slug: 'hello', cover: 'media-cover-v2' },
    })

    const report = await findMediaUsage('media-cover', { collections: [article], storeFor })
    expect(report.matches).toEqual([])
  })

  it('searches every collection the caller passes, not just one', async () => {
    await articleStore.create({ values: { title: 'A', slug: 'a', cover: 'shared-logo' } })
    await authorStore.create({ values: { name: 'Ada', portrait: 'shared-logo' } })

    const report = await findMediaUsage('shared-logo', {
      collections: [article, author],
      storeFor,
    })
    expect(report.matches.map((match) => match.collection).sort()).toEqual([
      'usage_article',
      'usage_author',
    ])
  })

  it('names the entry with a human title, using the same priority a content list uses', async () => {
    await articleStore.create({
      values: { title: 'My Article Title', slug: 'my-article', cover: 'media-x' },
    })

    const report = await findMediaUsage('media-x', { collections: [article], storeFor })
    expect(report.matches[0]?.title).toBe('My Article Title')
  })

  it('reports a bounded, honest truncation instead of silently under-scanning', async () => {
    for (let index = 0; index < 5; index += 1) {
      await articleStore.create({
        values: { title: `Post ${index}`, slug: `post-${index}`, cover: 'never-hit' },
      })
    }

    const report = await findMediaUsage('never-hit', {
      collections: [article],
      storeFor,
      maxEntries: 2,
      pageSize: 2,
    })
    expect(report.scannedEntries).toBe(2)
    expect(report.truncated).toBe(true)
  })

  it('scans the working face, so a reference in an unpublished draft is still reported', async () => {
    const draft = await articleStore.create({
      values: { title: 'Draft', slug: 'draft', cover: 'draft-only-media' },
    })
    expect(draft.status).toBe('draft')

    const report = await findMediaUsage('draft-only-media', { collections: [article], storeFor })
    expect(report.matches).toHaveLength(1)
  })
})
