import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blocksTable, versionsTable } from '../../src/store/naming.js'
import type { ContentStore } from '../../src/store/store.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

export interface ContentStoreHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The single contract suite for the content store.
 *
 * It is written once and run four times — SQLite as a unit test, Postgres,
 * MySQL and MariaDB as integration tests. Anything a caller would have to do
 * differently per dialect is a bug in `src/store`, and this file is where it
 * shows up rather than in production on the database nobody develops against.
 */

const tag: CollectionDefinition = {
  name: 'store_tag',
  labels: { singular: 'Tag', plural: 'Tags' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

const author: CollectionDefinition = {
  name: 'store_author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: { name: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

const article: CollectionDefinition = {
  name: 'store_article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true, keep: 5 },
  fields: {
    title: { kind: 'text', required: true, localized: true, options: { max: 200 } },
    slug: { kind: 'slug', unique: true, options: { from: 'title' } },
    body: { kind: 'richText', localized: true, options: {} },
    rating: { kind: 'number', options: {} },
    featured: { kind: 'boolean', options: {} },
    releasedOn: { kind: 'date', options: {} },
    publishedAt: { kind: 'datetime', options: {} },
    cover: { kind: 'media', options: { accept: ['image'] } },
    meta: { kind: 'json', options: {} },
    tint: { kind: 'color', options: {} },
    layout: { kind: 'select', options: { options: ['wide', 'narrow'] } },
    writer: { kind: 'relation', options: { to: 'store_author', onDelete: 'restrict' } },
    tags: { kind: 'relation', options: { to: 'store_tag', many: true } },
    zone: { kind: 'blocks', options: { allow: '*' } },
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['admin'],
  },
}

/** `trash: false` is the documented way back to a hard delete (ADR-0022). */
const note: CollectionDefinition = {
  name: 'store_note',
  labels: { singular: 'Note', plural: 'Notes' },
  trash: false,
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

const schema = [tag, author, article, note]

const richText = [
  {
    _key: 'b1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 's1', _type: 'span', text: 'Hello', marks: [] }],
    markDefs: [],
  },
]

export function runContentStoreContract(
  name: string,
  create: () => Promise<ContentStoreHarness>,
): void {
  describe(`ContentStore contract — ${name}`, () => {
    let harness: ContentStoreHarness
    let db: DatabaseHandle
    let articles: ContentStore
    let authors: ContentStore
    let tags: ContentStore

    /** A clock the tests can freeze, to prove the id tie-break carries ordering. */
    let clock = new Date('2026-08-13T09:00:00.000Z')

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      clock = new Date('2026-08-13T09:00:00.000Z')

      await dropSchemaTables(db, schema)
      await createSchemaTables(db, schema)

      const now = (): Date => clock
      // `siblings` is what lets `delete()` enforce `restrict` in application
      // code (ADR-0022): trashing is not a DELETE, so the foreign key has
      // nothing left to refuse. Every real runtime passes the whole set, and
      // so does this suite.
      const common = { db, now, defaultLocale: 'fr', siblings: schema } as const
      articles = createContentStore({ ...common, collection: article })
      authors = createContentStore({ ...common, collection: author })
      tags = createContentStore({ ...common, collection: tag })
    })

    afterEach(async () => {
      await dropSchemaTables(db, schema)
      await db.close()
      await harness.dispose?.()
    })

    const countRows = async (table: string, entryId: string): Promise<number> => {
      const result = await db.query<{ n: number }>(
        sql`select count(*) as n from ${identifier(table, db.dialect)}
            where ${identifier('entry_id', db.dialect)} = ${entryId}`,
      )
      return Number(result.rows[0]?.n ?? 0)
    }

    describe('typed CRUD', () => {
      it('reads back every field kind exactly as it was written', async () => {
        const entry = await articles.create({
          values: {
            title: 'Le titre',
            slug: 'le-titre',
            body: richText,
            rating: 4.5,
            featured: true,
            releasedOn: '2026-01-31',
            cover: 'a3f1e2d4-0000-7000-8000-000000000001',
            meta: { source: 'import', tags: ['a', 'b'] },
            tint: '#ff8800',
            layout: 'wide',
          },
        })

        const read = await articles.read(entry.id, { state: 'working' })

        expect(read?.values['title']).toBe('Le titre')
        expect(read?.values['body']).toEqual(richText)
        expect(read?.values['rating']).toBe(4.5)
        expect(read?.values['featured']).toBe(true)
        expect(read?.values['releasedOn']).toBe('2026-01-31')
        expect(read?.values['meta']).toEqual({ source: 'import', tags: ['a', 'b'] })
        expect(read?.values['tint']).toBe('#ff8800')
        expect(read?.values['layout']).toBe('wide')
      })

      it('mints a time-ordered identifier without asking the database for one', async () => {
        const first = await tags.create({ values: { title: 'first' } })
        const second = await tags.create({ values: { title: 'second' } })

        expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
        expect(second.id > first.id).toBe(true)
      })

      it('accepts an identifier the caller already owns, so content can be imported', async () => {
        const id = '01930000-0000-7000-8000-0000000000aa'
        const created = await tags.create({ id, values: { title: 'imported' } })

        expect(created.id).toBe(id)
        expect((await tags.read(id, { state: 'working' }))?.values['title']).toBe('imported')
      })

      it('refuses a value for a field the collection does not declare', async () => {
        await expect(tags.create({ values: { nope: 'x' } })).rejects.toMatchObject({
          name: 'CogentaError',
          code: 'CONTENT_INVALID',
        })
      })

      it('lets a draft be saved incomplete but refuses to publish it', async () => {
        const draft = await articles.create({ values: { slug: 'sans-titre' } })

        await expect(articles.publish(draft.id)).rejects.toMatchObject({
          code: 'CONTENT_INVALID',
        })
      })

      it('purges an entry with its versions and its blocks', async () => {
        const entry = await articles.create({
          values: { title: 'à supprimer' },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'x' } }] },
        })

        expect(await articles.purge(entry.id)).toBe(true)
        expect(await articles.read(entry.id, { state: 'working' })).toBeNull()
        expect(await countRows(blocksTable(article.name), entry.id)).toBe(0)
        expect(await countRows(versionsTable(article.name), entry.id)).toBe(0)
      })

      it('reports nothing removed when the entry was never there', async () => {
        expect(await tags.delete('01930000-0000-7000-8000-0000000000bb')).toBe(false)
      })
    })

    describe('relations', () => {
      it('stores a to-one relation in a column and a to-many in a join table', async () => {
        const writer = await authors.create({ values: { name: 'Colette' }, status: 'published' })
        const first = await tags.create({ values: { title: 'roman' }, status: 'published' })
        const second = await tags.create({ values: { title: 'essai' }, status: 'published' })

        const entry = await articles.create({
          values: { title: 'Sido', writer: writer.id, tags: [second.id, first.id] },
        })

        const read = await articles.read(entry.id, { state: 'working' })
        expect(read?.values['writer']).toBe(writer.id)
        // The order the editor chose is the order that comes back.
        expect(read?.values['tags']).toEqual([second.id, first.id])
      })

      it('refuses to delete a target that is still referenced, by default', async () => {
        const writer = await authors.create({ values: { name: 'Colette' } })
        await articles.create({ values: { title: 'Sido', writer: writer.id } })

        await expect(authors.delete(writer.id)).rejects.toMatchObject({ name: 'CogentaError' })
      })
    })

    /**
     * The trash (`schema@2.0`, ADR-0022).
     *
     * Every one of these is a property the ADR states in prose; asserting them
     * here is what keeps the prose true on all four dialects rather than on
     * the one someone happened to develop against.
     */
    describe('trash', () => {
      it('keeps the entry, its versions and its blocks when it is trashed', async () => {
        const entry = await articles.create({
          values: { title: 'à jeter' },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'x' } }] },
        })

        expect(await articles.delete(entry.id)).toBe(true)
        // Nothing was destroyed — which is the only way untrash() can give
        // back exactly what was taken.
        expect(await countRows(blocksTable(article.name), entry.id)).toBeGreaterThan(0)
        expect(await countRows(versionsTable(article.name), entry.id)).toBeGreaterThan(0)
      })

      it('hides a trashed entry from every read unless the trash is asked for', async () => {
        const entry = await articles.create({ values: { title: 'à jeter' }, status: 'published' })
        await articles.publish(entry.id)
        await articles.delete(entry.id)

        expect(await articles.read(entry.id)).toBeNull()
        expect(await articles.read(entry.id, { state: 'working' })).toBeNull()
        expect((await articles.list()).items).toHaveLength(0)
        expect((await articles.list({ state: 'working' })).items).toHaveLength(0)
        await expect(articles.history(entry.id)).rejects.toMatchObject({
          code: 'CONTENT_NOT_FOUND',
        })

        const seen = await articles.read(entry.id, { state: 'working', trashed: 'include' })
        expect(seen?.id).toBe(entry.id)
        expect(seen?.deletedAt).not.toBeNull()
        expect((await articles.history(entry.id, { trashed: 'include' })).length).toBeGreaterThan(0)
      })

      it('lists only the trash when that is what was asked for', async () => {
        const kept = await articles.create({ values: { title: 'gardé' } })
        const thrown = await articles.create({ values: { title: 'jeté' } })
        await articles.delete(thrown.id)

        const live = await articles.list({ state: 'working' })
        expect(live.items.map((item) => item.id)).toEqual([kept.id])

        const trash = await articles.list({ state: 'working', trashed: 'only' })
        expect(trash.items.map((item) => item.id)).toEqual([thrown.id])
      })

      it('gives an entry back with the status it went in with, never as a draft', async () => {
        const entry = await articles.create({ values: { title: 'publié' } })
        await articles.publish(entry.id)
        await articles.delete(entry.id)

        const back = await articles.untrash(entry.id)

        // The whole reason deletedAt is orthogonal to status: restoring a
        // published article must not quietly demote it and invite a second,
        // accidental publication.
        expect(back.status).toBe('published')
        expect(back.deletedAt).toBeNull()
        expect(await articles.read(entry.id)).not.toBeNull()
      })

      it('refuses to take an entry out of the trash it was never in', async () => {
        const entry = await articles.create({ values: { title: 'vivant' } })

        await expect(articles.untrash(entry.id)).rejects.toMatchObject({
          code: 'CONTENT_NOT_TRASHED',
        })
      })

      it('leaves a translation family intact while its source is in the trash', async () => {
        const source = await articles.create({ values: { title: 'Source' }, status: 'published' })
        const translated = await articles.create({
          locale: 'en',
          translationOf: source.id,
          status: 'published',
          values: { title: 'Source', slug: 'source-en' },
        })

        await articles.delete(source.id)

        // Before 2.0 this deleted the source row, and `on delete set null`
        // silently broke the family. Now the link survives untouched.
        const stillLinked = await articles.read(translated.id, { state: 'working' })
        expect(stillLinked?.translationOf).toBe(source.id)

        await articles.untrash(source.id)
        const family = await articles.translations(translated.id)
        expect(family.map((member) => member.id).sort()).toEqual([source.id, translated.id].sort())
      })

      it('hides a trashed member from its own translation family', async () => {
        const source = await articles.create({ values: { title: 'Source' }, status: 'published' })
        const translated = await articles.create({
          locale: 'en',
          translationOf: source.id,
          status: 'published',
          values: { title: 'Source', slug: 'source-en-2' },
        })

        await articles.delete(translated.id)

        expect((await articles.translations(source.id)).map((member) => member.id)).toEqual([
          source.id,
        ])
        expect(
          (await articles.translations(source.id, { trashed: 'include' }))
            .map((member) => member.id)
            .sort(),
        ).toEqual([source.id, translated.id].sort())
      })

      it('never resolves a locale to a trashed entry', async () => {
        const source = await articles.create({ values: { title: 'Source' }, status: 'published' })
        const translated = await articles.create({
          locale: 'en',
          translationOf: source.id,
          status: 'published',
          values: { title: 'Source', slug: 'source-en-3' },
        })
        await articles.delete(translated.id)

        const resolved = await articles.resolveLocale(source.id, 'en', { fallback: 'original' })
        expect(resolved.outcome).toBe('found')
        if (resolved.outcome === 'found') {
          expect(resolved.entry.id).toBe(source.id)
          expect(resolved.fellBack).toBe(true)
        }
      })

      it('refuses to trash an entry a restrict relation still points at', async () => {
        const writer = await authors.create({ values: { name: 'Colette' } })
        await articles.create({ values: { title: 'Sido', writer: writer.id } })

        // The foreign key cannot refuse an UPDATE, so this has to be — and is
        // — enforced in application code, naming what blocks.
        await expect(authors.delete(writer.id)).rejects.toMatchObject({
          code: 'CONTENT_REFERENCED',
        })
        expect(await authors.read(writer.id, { state: 'working' })).not.toBeNull()
      })

      it('names how many entries block, and which collection they are in', async () => {
        const writer = await authors.create({ values: { name: 'Colette' } })
        await articles.create({ values: { title: 'Sido', writer: writer.id } })
        await articles.create({ values: { title: 'Chéri', writer: writer.id } })

        await expect(authors.delete(writer.id)).rejects.toMatchObject({
          message: expect.stringContaining('2 entries of "store_article"'),
        })
      })

      it('stops blocking once the referring entry is itself in the trash', async () => {
        const writer = await authors.create({ values: { name: 'Colette' } })
        const referring = await articles.create({ values: { title: 'Sido', writer: writer.id } })

        await articles.delete(referring.id)
        expect(await authors.delete(writer.id)).toBe(true)
      })

      it('refuses to purge an entry a restrict relation still points at', async () => {
        const writer = await authors.create({ values: { name: 'Colette' } })
        await articles.create({ values: { title: 'Sido', writer: writer.id } })

        // The same sentence on both paths, rather than a written error on one
        // and a raw driver message on the other.
        await expect(authors.purge(writer.id)).rejects.toMatchObject({
          code: 'CONTENT_REFERENCED',
        })
      })

      it('purges for real, leaving nothing behind', async () => {
        const entry = await articles.create({
          values: { title: 'définitif' },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'x' } }] },
        })
        await articles.delete(entry.id)

        expect(await articles.purge(entry.id)).toBe(true)
        expect(await articles.read(entry.id, { state: 'working', trashed: 'include' })).toBeNull()
        expect(await countRows(versionsTable(article.name), entry.id)).toBe(0)
      })

      it('deletes for real, with no trash at all, when the collection opts out', async () => {
        const notes = createContentStore({
          db,
          collection: note,
          now: () => clock,
          defaultLocale: 'fr',
          siblings: schema,
        })
        const entry = await notes.create({ values: { title: 'éphémère' } })

        expect(await notes.delete(entry.id)).toBe(true)
        // Not trashed — gone. `trash: false` is exactly the pre-2.0 behaviour.
        expect(await notes.read(entry.id, { state: 'working', trashed: 'include' })).toBeNull()
        expect((await notes.purgeExpired()).purged).toBe(0)
      })

      it('purges only what has sat in the trash longer than the retention window', async () => {
        const old = await articles.create({ values: { title: 'vieux' } })
        await articles.delete(old.id)

        // The article collection keeps its trash 30 days (the default); move
        // the clock past that and only this entry is old enough.
        clock = new Date('2026-09-20T09:00:00.000Z')
        const recent = await articles.create({ values: { title: 'récent' } })
        await articles.delete(recent.id)

        const report = await articles.purgeExpired()
        expect(report.purged).toBe(1)
        expect(await articles.read(old.id, { state: 'working', trashed: 'include' })).toBeNull()
        expect(
          await articles.read(recent.id, { state: 'working', trashed: 'include' }),
        ).not.toBeNull()
      })
    })

    describe('duplication', () => {
      it('copies the values, the relations and the blocks into a new draft', async () => {
        const writer = await authors.create({ values: { name: 'Colette' } })
        const first = await tags.create({ values: { title: 'roman' } })
        const source = await articles.create({
          values: {
            title: 'Sido',
            slug: 'sido',
            rating: 4.5,
            writer: writer.id,
            tags: [first.id],
          },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'A' } }] },
          status: 'published',
        })

        const copy = await articles.duplicate(source.id)

        expect(copy.id).not.toBe(source.id)
        expect(copy.status).toBe('draft')
        expect(copy.version).toBe(1)
        expect(copy.values['title']).toBe('Sido')
        expect(copy.values['rating']).toBe(4.5)
        expect(copy.values['writer']).toBe(writer.id)
        expect(copy.values['tags']).toEqual([first.id])
        expect(copy.blocks['zone']?.[0]?.data).toEqual({ text: 'A' })
      })

      it('leaves the entry it copied untouched', async () => {
        const source = await articles.create({ values: { title: 'Sido', slug: 'sido' } })
        await articles.duplicate(source.id)

        const read = await articles.read(source.id, { state: 'working' })
        expect(read?.values['slug']).toBe('sido')
        expect(read?.version).toBe(1)
      })

      it('gives the copied blocks their own keys, so a key never names two entries', async () => {
        const source = await articles.create({
          values: { title: 'Blocs' },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'A' } }] },
        })

        const copy = await articles.duplicate(source.id)
        expect(copy.blocks['zone']?.[0]?.key).toBeTruthy()
        expect(copy.blocks['zone']?.[0]?.key).not.toBe('k1')
      })

      it('derives a free value for a unique field rather than failing on the index', async () => {
        const source = await articles.create({ values: { title: 'Sido', slug: 'sido' } })

        const first = await articles.duplicate(source.id)
        const second = await articles.duplicate(source.id)

        expect(first.values['slug']).toBe('sido-copy')
        expect(second.values['slug']).toBe('sido-copy-2')
      })

      it('uses the value the caller gave for a unique field instead of deriving one', async () => {
        const source = await articles.create({ values: { title: 'Sido', slug: 'sido' } })

        const copy = await articles.duplicate(source.id, {
          values: { slug: 'sido-2026', title: 'Sido, réédition' },
        })

        expect(copy.values['slug']).toBe('sido-2026')
        expect(copy.values['title']).toBe('Sido, réédition')
      })

      it('starts a new translation family instead of joining the one it was copied from', async () => {
        const source = await articles.create({ values: { title: 'Sido', slug: 'sido' } })
        const translated = await articles.create({
          values: { title: 'Sido', slug: 'sido-en' },
          locale: 'en',
          translationOf: source.id,
        })

        const copy = await articles.duplicate(translated.id)

        expect(copy.translationOf).toBeNull()
        expect(copy.locale).toBe('en')
        // The source family is unchanged: the copy is not a third language of it.
        const family = await articles.translations(source.id)
        expect(family.map((entry) => entry.id)).not.toContain(copy.id)
      })

      it('never carries over a publication date', async () => {
        const source = await articles.create({
          values: { title: 'Sido', slug: 'sido' },
          status: 'published',
        })
        expect(source.values['publishedAt']).toBeTruthy()

        const copy = await articles.duplicate(source.id)
        expect(copy.values['publishedAt']).toBeNull()
        expect(copy.publishedAt).toBeNull()
      })

      it('starts its own history rather than inheriting the source’s', async () => {
        const source = await articles.create({ values: { title: 'Sido', slug: 'sido' } })
        await articles.update(source.id, { values: { title: 'Sido II' } })
        await articles.update(source.id, { values: { title: 'Sido III' } })

        const copy = await articles.duplicate(source.id)

        expect(await articles.history(copy.id)).toHaveLength(1)
        expect((await articles.history(source.id)).length).toBeGreaterThan(1)
      })

      it('copies the draft an editor is looking at, not the published version underneath', async () => {
        const source = await articles.create({
          values: { title: 'Publié', slug: 'publie' },
          status: 'published',
        })
        await articles.update(source.id, { values: { title: 'En cours' } })

        const copy = await articles.duplicate(source.id)
        expect(copy.values['title']).toBe('En cours')
      })

      it('keeps the provenance of what it copied, so generated content stays generated', async () => {
        const source = await articles.create({
          values: { title: 'Écrit par un agent' },
          provenance: 'generated',
          provenanceDetail: { agent: 'writer', model: 'test' },
        })

        const copy = await articles.duplicate(source.id)
        expect(copy.provenance).toBe('generated')
        expect(copy.provenanceDetail).toEqual({ agent: 'writer', model: 'test' })
      })

      it('lets the caller state the provenance of the copy itself', async () => {
        const source = await articles.create({
          values: { title: 'Écrit par un agent' },
          provenance: 'generated',
        })

        const copy = await articles.duplicate(source.id, { provenance: 'assisted' })
        expect(copy.provenance).toBe('assisted')
      })

      it('refuses to copy an entry that is not there', async () => {
        await expect(
          articles.duplicate('01930000-0000-7000-8000-0000000000cc'),
        ).rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND' })
      })
    })

    describe('block zones', () => {
      it('stores one row per block rather than a JSON array in the content row', async () => {
        const entry = await articles.create({
          values: { title: 'Blocs' },
          blocks: {
            zone: [
              { key: 'k1', type: 'hero', data: { title: 'A' } },
              { key: 'k2', type: 'prose', data: { text: 'B' } },
            ],
          },
        })

        expect(await countRows(blocksTable(article.name), entry.id)).toBe(2)
      })

      it('keeps block order and block keys across an edit', async () => {
        const entry = await articles.create({
          values: { title: 'Blocs' },
          blocks: {
            zone: [
              { key: 'k1', type: 'hero', data: { title: 'A' } },
              { key: 'k2', type: 'prose', data: { text: 'B' } },
            ],
          },
        })

        await articles.update(entry.id, {
          blocks: {
            zone: [
              { key: 'k2', type: 'prose', data: { text: 'B' } },
              { key: 'k1', type: 'hero', data: { title: 'A' } },
            ],
          },
        })

        const read = await articles.read(entry.id, { state: 'working' })
        expect(read?.blocks['zone']?.map((block) => block.key)).toEqual(['k2', 'k1'])
      })

      it('mints a stable key for a block that arrives without one', async () => {
        const entry = await articles.create({
          values: { title: 'Blocs' },
          blocks: { zone: [{ key: '', type: 'prose', data: { text: 'A' } }] },
        })

        const key = entry.blocks['zone']?.[0]?.key
        expect(key).toBeTruthy()

        await articles.update(entry.id, { values: { title: 'Blocs II' } })
        const read = await articles.read(entry.id, { state: 'working' })
        expect(read?.blocks['zone']?.[0]?.key).toBe(key)
      })

      it('refuses two blocks with the same key in one zone', async () => {
        await expect(
          articles.create({
            values: { title: 'Blocs' },
            blocks: {
              zone: [
                { key: 'same', type: 'prose', data: {} },
                { key: 'same', type: 'prose', data: {} },
              ],
            },
          }),
        ).rejects.toMatchObject({ code: 'CONTENT_INVALID' })
      })
    })

    describe('drafts and publication', () => {
      it('hides a draft from the published read, whatever the caller asks for', async () => {
        const entry = await articles.create({ values: { title: 'Brouillon' } })

        expect(await articles.read(entry.id)).toBeNull()
        expect((await articles.read(entry.id, { state: 'working' }))?.values['title']).toBe(
          'Brouillon',
        )
      })

      it('runs the whole cycle: create, draft, publish, edit, restore', async () => {
        const entry = await articles.create({
          values: { title: 'Version un', slug: 'v1' },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'un' } }] },
        })

        await articles.publish(entry.id)
        expect((await articles.read(entry.id))?.values['title']).toBe('Version un')

        await articles.update(entry.id, {
          values: { title: 'Version deux' },
          blocks: { zone: [{ key: 'k1', type: 'prose', data: { text: 'deux' } }] },
        })

        // The public still sees version one: an edit is a draft until published.
        expect((await articles.read(entry.id))?.values['title']).toBe('Version un')
        expect((await articles.read(entry.id))?.blocks['zone']?.[0]?.data).toEqual({ text: 'un' })
        expect((await articles.read(entry.id, { state: 'working' }))?.values['title']).toBe(
          'Version deux',
        )

        await articles.publish(entry.id)
        expect((await articles.read(entry.id))?.values['title']).toBe('Version deux')
        expect((await articles.read(entry.id))?.blocks['zone']?.[0]?.data).toEqual({ text: 'deux' })

        const restored = await articles.restore(entry.id, 1)
        expect(restored.values['title']).toBe('Version un')
        // Restoring is an edit, so the public still reads the published state.
        expect((await articles.read(entry.id))?.values['title']).toBe('Version deux')

        await articles.publish(entry.id)
        expect((await articles.read(entry.id))?.values['title']).toBe('Version un')
        expect((await articles.read(entry.id))?.blocks['zone']?.[0]?.data).toEqual({ text: 'un' })
      })

      it('records a publication instant per entry', async () => {
        const entry = await articles.create({ values: { title: 'Daté' } })
        expect(entry.publishedAt).toBeNull()

        const published = await articles.publish(entry.id)
        expect(published.publishedAt).toBe(clock.toISOString())
      })

      it('takes an entry back out of publication without losing it', async () => {
        const entry = await articles.create({ values: { title: 'Public' } })
        await articles.publish(entry.id)

        await articles.unpublish(entry.id)
        expect(await articles.read(entry.id)).toBeNull()
        expect((await articles.read(entry.id, { state: 'working' }))?.status).toBe('draft')
      })

      it('keeps a history and stops it growing without bound', async () => {
        const entry = await articles.create({ values: { title: 'v1' } })
        await articles.publish(entry.id)

        for (let index = 2; index <= 10; index += 1) {
          await articles.update(entry.id, { values: { title: `v${index}` } })
        }

        const history = await articles.history(entry.id)
        // The newest `keep` versions, plus the live one which is never pruned.
        expect(history.length).toBeLessThanOrEqual((article.versioning?.keep ?? 0) + 1)
        expect(history.some((version) => version.live)).toBe(true)
        expect(history[0]?.version).toBe(10)
      })

      it('diffs field by field and block by block, never a serialisation', async () => {
        const entry = await articles.create({
          values: { title: 'Un', rating: 1 },
          blocks: {
            zone: [
              { key: 'k1', type: 'prose', data: { text: 'A' } },
              { key: 'k2', type: 'prose', data: { text: 'B' } },
            ],
          },
        })

        await articles.update(entry.id, {
          values: { title: 'Deux' },
          blocks: {
            zone: [
              { key: 'k2', type: 'prose', data: { text: 'B' } },
              { key: 'k1', type: 'prose', data: { text: 'A modifié' } },
              { key: 'k3', type: 'cta', data: { title: 'Clic' } },
            ],
          },
        })

        const diff = await articles.diff(entry.id, 1, 2)

        expect(diff.fields).toContainEqual({
          field: 'title',
          change: 'changed',
          before: 'Un',
          after: 'Deux',
        })
        // Untouched fields do not appear: a diff is what changed, not the entry.
        expect(diff.fields.map((change) => change.field)).not.toContain('rating')

        const byKey = new Map(diff.blocks.map((change) => [change.key, change]))
        expect(byKey.get('k1')?.change).toBe('changed')
        expect(byKey.get('k1')?.fields).toContainEqual({
          field: 'text',
          change: 'changed',
          before: 'A',
          after: 'A modifié',
        })
        expect(byKey.get('k2')?.change).toBe('moved')
        expect(byKey.get('k3')?.change).toBe('added')
      })

      it('refuses to compare a version it no longer keeps', async () => {
        const entry = await articles.create({ values: { title: 'v1' } })
        await articles.publish(entry.id)
        for (let index = 2; index <= 12; index += 1) {
          await articles.update(entry.id, { values: { title: `v${index}` } })
        }

        await expect(articles.diff(entry.id, 2, 12)).rejects.toMatchObject({
          code: 'CONTENT_NOT_FOUND',
        })
      })
    })

    describe('cursor pagination', () => {
      const publishMany = async (count: number): Promise<string[]> => {
        const ids: string[] = []
        for (let index = 0; index < count; index += 1) {
          const entry = await articles.create({
            values: { title: `entrée ${index}`, slug: `entree-${index}` },
            status: 'published',
          })
          ids.push(entry.id)
        }
        return ids
      }

      it('walks a whole collection without repeating or skipping an entry', async () => {
        const created = await publishMany(5)

        const seen: string[] = []
        let cursor: string | null = null

        do {
          const page: Awaited<ReturnType<typeof articles.list>> = await articles.list({
            limit: 2,
            ...(cursor === null ? {} : { cursor }),
          })
          seen.push(...page.items.map((item) => item.id))
          cursor = page.nextCursor
        } while (cursor !== null)

        expect(new Set(seen).size).toBe(5)
        expect([...seen].sort()).toEqual([...created].sort())
      })

      it('stays stable while entries are inserted between two pages', async () => {
        const created = await publishMany(5)

        const first = await articles.list({ limit: 2 })
        // Ten concurrent insertions, exactly what an offset cannot survive.
        await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            articles.create({
              values: { title: `intrus ${index}`, slug: `intrus-${index}` },
              status: 'published',
            }),
          ),
        )

        const seen = [...first.items.map((item) => item.id)]
        let cursor = first.nextCursor

        while (cursor !== null) {
          const page = await articles.list({ limit: 2, cursor })
          seen.push(...page.items.map((item) => item.id))
          cursor = page.nextCursor
        }

        // No entry is seen twice, and none of the five originals is lost.
        expect(new Set(seen).size).toBe(seen.length)
        for (const id of created) expect(seen).toContain(id)
      })

      it('orders by a column that ties, and still hands out every entry once', async () => {
        // The clock is frozen, so all five share a createdAt to the millisecond.
        const created = await publishMany(5)

        const seen: string[] = []
        let cursor: string | null = null

        do {
          const page: Awaited<ReturnType<typeof articles.list>> = await articles.list({
            limit: 2,
            sort: { field: 'createdAt', direction: 'desc' },
            ...(cursor === null ? {} : { cursor }),
          })
          seen.push(...page.items.map((item) => item.id))
          cursor = page.nextCursor
        } while (cursor !== null)

        expect([...seen].sort()).toEqual([...created].sort())
      })

      it('refuses a cursor taken under a different ordering', async () => {
        await publishMany(3)
        const page = await articles.list({ limit: 1 })

        await expect(
          articles.list({
            limit: 1,
            sort: { field: 'createdAt', direction: 'asc' },
            cursor: page.nextCursor ?? '',
          }),
        ).rejects.toMatchObject({ code: 'CONTENT_INVALID' })
      })

      it('never lists a draft when no state is asked for', async () => {
        await articles.create({ values: { title: 'brouillon' } })
        const published = await articles.create({
          values: { title: 'publié' },
          status: 'published',
        })

        const page = await articles.list()
        expect(page.items.map((item) => item.id)).toEqual([published.id])
      })

      it('filters on a declared field', async () => {
        await articles.create({ values: { title: 'a', layout: 'wide' }, status: 'published' })
        await articles.create({ values: { title: 'b', layout: 'narrow' }, status: 'published' })

        const page = await articles.list({ where: { layout: 'narrow' } })
        expect(page.items.map((item) => item.values['title'])).toEqual(['b'])
      })
    })

    describe('internationalisation', () => {
      const family = async (): Promise<{ source: string; translation: string }> => {
        const source = await articles.create({
          values: { title: 'Bonjour', slug: 'bonjour' },
          locale: 'fr',
          status: 'published',
        })
        const translation = await articles.create({
          values: { title: 'Hello', slug: 'hello' },
          locale: 'en',
          translationOf: source.id,
        })
        return { source: source.id, translation: translation.id }
      }

      it('stores one entry per language, linked by translationOf', async () => {
        const { source, translation } = await family()

        const members = await articles.translations(translation)
        expect(members.map((entry) => entry.locale).sort()).toEqual(['en', 'fr'])
        expect(members.find((entry) => entry.locale === 'en')?.translationOf).toBe(source)
      })

      it('publishes one language while the other stays a draft', async () => {
        const { source, translation } = await family()

        expect((await articles.read(source))?.status).toBe('published')
        expect(await articles.read(translation)).toBeNull()

        const french = await articles.list({ locale: 'fr' })
        const english = await articles.list({ locale: 'en' })
        expect(french.items).toHaveLength(1)
        expect(english.items).toHaveLength(0)
      })

      it('versions each language on its own', async () => {
        const { source, translation } = await family()

        await articles.update(translation, { values: { title: 'Hello again' } })

        expect((await articles.read(source))?.version).toBe(1)
        expect((await articles.read(translation, { state: 'working' }))?.version).toBe(2)
      })

      it('falls back to the original when that is the chosen strategy', async () => {
        const { source } = await family()

        const resolved = await articles.resolveLocale(source, 'de', { fallback: 'original' })
        expect(resolved.outcome).toBe('found')
        if (resolved.outcome === 'found') {
          expect(resolved.fellBack).toBe(true)
          expect(resolved.entry.locale).toBe('fr')
        }
      })

      it('hides the content when that is the chosen strategy', async () => {
        const { source } = await family()

        expect(await articles.resolveLocale(source, 'de', { fallback: 'hide' })).toEqual({
          outcome: 'hidden',
        })
      })

      it('reports a missing page when that is the chosen strategy', async () => {
        const { source } = await family()

        expect(await articles.resolveLocale(source, 'de', { fallback: 'notFound' })).toEqual({
          outcome: 'notFound',
        })
      })

      it('treats an unpublished translation as absent, then finds it once published', async () => {
        const { source, translation } = await family()

        const before = await articles.resolveLocale(source, 'en', { fallback: 'original' })
        expect(before.outcome).toBe('found')
        if (before.outcome === 'found') expect(before.entry.locale).toBe('fr')

        await articles.publish(translation)

        const after = await articles.resolveLocale(source, 'en', { fallback: 'original' })
        expect(after.outcome).toBe('found')
        if (after.outcome === 'found') {
          expect(after.entry.locale).toBe('en')
          expect(after.fellBack).toBe(false)
        }
      })

      it('resolves against the working state for a preview', async () => {
        const { source, translation } = await family()

        const preview = await articles.resolveLocale(source, 'en', {
          fallback: 'hide',
          state: 'working',
        })
        expect(preview.outcome).toBe('found')
        if (preview.outcome === 'found') expect(preview.entry.id).toBe(translation)
      })
    })
  })
}
