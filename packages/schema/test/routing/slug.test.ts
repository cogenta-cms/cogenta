import { createSqliteHandle, type DatabaseHandle, isCogentaError, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveSlug, sqlSlugTaken, uniqueSlug } from '../../src/routing/slug.js'
import { isSlug, slugify, slugifyOrThrow } from '../../src/routing/slugify.js'
import type { CollectionDefinition } from '../../src/types.js'

const article: CollectionDefinition = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  fields: {
    title: { kind: 'text', options: { max: 200 } },
    slug: { kind: 'slug', options: { from: 'title' } },
  },
  permissions: { read: ['public'] },
}

/** The error code a call raises, so an assertion names the contract, not the wording. */
function codeOf(run: () => unknown): string {
  try {
    run()
    return 'nothing was thrown'
  } catch (error) {
    return isCogentaError(error) ? error.code : `a plain ${String(error)}`
  }
}

describe('slugify', () => {
  it('strips the accents of a French title', () => {
    expect(slugify('Où va la cigogne à Noël ?')).toBe('ou-va-la-cigogne-a-noel')
  })

  it('transliterates letters Unicode does not decompose', () => {
    expect(slugify('Große Straße')).toBe('grosse-strasse')
    expect(slugify('Cœur æther')).toBe('coeur-aether')
    expect(slugify('Smørrebrød')).toBe('smorrebrod')
  })

  it('collapses punctuation and repeated separators into one dash', () => {
    expect(slugify('Hello --- world!!!  Again')).toBe('hello-world-again')
  })

  it('truncates on a word boundary rather than mid-word', () => {
    expect(slugify('alpha bravo charlie delta', { maxLength: 16 })).toBe('alpha-bravo')
  })

  it('returns nothing for a title with no transliterable character', () => {
    expect(slugify('日本語のタイトル')).toBe('')
  })

  it('names what to do when a title cannot become a slug', () => {
    expect(codeOf(() => slugifyOrThrow('日本語'))).toBe('CONTENT_SLUG_INVALID')
  })

  it('recognises a slug an editor typed by hand', () => {
    expect(isSlug('faq-2026')).toBe(true)
    expect(isSlug('Not A Slug')).toBe(false)
    expect(isSlug('double--dash')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('keeps the plain slug when nothing holds it', async () => {
    await expect(uniqueSlug('mon-article', () => false)).resolves.toBe('mon-article')
  })

  it('suffixes from 2, so the pair reads as a numbered series', async () => {
    const taken = new Set(['mon-article'])
    await expect(uniqueSlug('mon-article', (candidate) => taken.has(candidate))).resolves.toBe(
      'mon-article-2',
    )
  })

  it('walks past every taken suffix', async () => {
    const taken = new Set(['a', 'a-2', 'a-3'])
    await expect(uniqueSlug('a', (candidate) => taken.has(candidate))).resolves.toBe('a-4')
  })

  it('keeps a suffixed slug inside the length budget', async () => {
    const slug = await uniqueSlug('abcdefghij', (candidate) => candidate === 'abcdefghij', {
      maxLength: 10,
    })
    expect(slug).toBe('abcdefgh-2')
    expect(slug.length).toBeLessThanOrEqual(10)
  })

  it('gives up rather than spinning when nothing is ever free', async () => {
    await expect(uniqueSlug('a', () => true, { maxAttempts: 3 })).rejects.toMatchObject({
      code: 'CONTENT_SLUG_TAKEN',
    })
  })
})

describe('deriveSlug', () => {
  it('builds the slug from the field named by from:', async () => {
    await expect(
      deriveSlug({
        collection: article,
        field: 'slug',
        values: { title: 'Été à Paris' },
        isTaken: () => false,
      }),
    ).resolves.toBe('ete-a-paris')
  })

  it('prefers a slug the editor typed over the source field', async () => {
    await expect(
      deriveSlug({
        collection: article,
        field: 'slug',
        values: { title: 'Été à Paris', slug: 'paris-summer' },
        isTaken: () => false,
      }),
    ).resolves.toBe('paris-summer')
  })

  it('says which field to fill when there is nothing to derive from', async () => {
    await expect(
      deriveSlug({ collection: article, field: 'slug', values: {}, isTaken: () => false }),
    ).rejects.toMatchObject({ code: 'CONTENT_SLUG_INVALID' })
  })
})

describe('slug uniqueness in the database', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    await db.query(sql`
      create table entries (
        id text primary key,
        collection text not null,
        locale text not null,
        slug text not null
      )`)
  })

  afterEach(async () => {
    await db.close()
  })

  async function insert(id: string, locale: string, slug: string): Promise<void> {
    await db.query(sql`
      insert into entries (id, collection, locale, slug)
      values (${id}, ${'article'}, ${locale}, ${slug})`)
  }

  it('suffixes a slug already used in the same collection and locale', async () => {
    await insert('a', 'fr', 'ete-a-paris')

    const slug = await deriveSlug({
      collection: article,
      field: 'slug',
      values: { title: 'Été à Paris' },
      isTaken: sqlSlugTaken({
        db,
        table: 'entries',
        collection: 'article',
        collectionColumn: 'collection',
        locale: 'fr',
      }),
    })

    expect(slug).toBe('ete-a-paris-2')
  })

  it('leaves the same slug free in another locale, because ADR-0014 is one entry per language', async () => {
    await insert('a', 'fr', 'ete-a-paris')

    const slug = await deriveSlug({
      collection: article,
      field: 'slug',
      values: { title: 'Été à Paris' },
      isTaken: sqlSlugTaken({
        db,
        table: 'entries',
        collection: 'article',
        collectionColumn: 'collection',
        locale: 'en',
      }),
    })

    expect(slug).toBe('ete-a-paris')
  })

  it('does not count the entry being saved as its own collision', async () => {
    await insert('a', 'fr', 'ete-a-paris')

    const slug = await deriveSlug({
      collection: article,
      field: 'slug',
      values: { title: 'Été à Paris' },
      isTaken: sqlSlugTaken({
        db,
        table: 'entries',
        collection: 'article',
        collectionColumn: 'collection',
        locale: 'fr',
        excludeId: 'a',
      }),
    })

    expect(slug).toBe('ete-a-paris')
  })

  it('leaves the same slug free in another collection', async () => {
    await db.query(sql`
      insert into entries (id, collection, locale, slug)
      values (${'p'}, ${'page'}, ${'fr'}, ${'contact'})`)

    const taken = sqlSlugTaken({
      db,
      table: 'entries',
      collection: 'article',
      collectionColumn: 'collection',
      locale: 'fr',
    })

    await expect(taken('contact')).resolves.toBe(false)
  })
})
