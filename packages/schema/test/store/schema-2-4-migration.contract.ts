import { createMigrator, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { defineTaxonomy } from '../../src/define-taxonomy.js'
import { f } from '../../src/fields.js'
import {
  integerColumn,
  jsonColumn,
  textColumn,
  timestampColumn,
  uuidColumn,
} from '../../src/store/columns.js'
import {
  blocksTable,
  columnFor,
  entriesTable,
  indexName,
  relationTable,
  taxonomyTable,
  versionsTable,
} from '../../src/store/naming.js'
import { schema24Migration } from '../../src/store/schema-2-4-migration.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import { createTaxonomyStore } from '../../src/store/taxonomy-store.js'

export interface MigrationHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The `schema@2.4` repair, run against the shape that carries the bug.
 *
 * The entries table is built here by hand with `on delete cascade` on the
 * single-valued taxonomy column — the constraint `tables.ts` used to generate —
 * and the first test of the file proves the fixture really does lose content,
 * before anything is migrated. Without that counter-test, everything after it
 * would be equally consistent with "the fixture was already correct", which is
 * the failure mode of testing a migration against the schema it is supposed to
 * produce.
 *
 * The collection deliberately carries **both** taxonomy shapes. They are
 * opposites, and only one of them is being repaired: `many: false` lives in a
 * column of the entries table, where `cascade` deletes the entry; `many: true`
 * lives in a join table, where `cascade` deletes the classification and is
 * correct. A migration that flipped both would break un-classifying.
 */

const topic = defineTaxonomy({
  name: 'mig24_topic',
  labels: { singular: { en: 'Topic' } },
  hierarchical: false,
  permissions: { read: ['public'], create: ['editor'], delete: ['admin'] },
})

const article = defineCollection({
  name: 'mig24_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ unique: true }),
    /** The one being repaired: a column of the entries table. */
    topic: f.taxonomy({ of: 'mig24_topic', many: false }),
    /** The one that must keep cascading: a join table. */
    tags: f.taxonomy({ of: 'mig24_topic', many: true }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
})

const collections = [article]
const taxonomies = [topic]

const TABLE = entriesTable(article.name)
const TOPIC_COLUMN = columnFor('topic')

export function runSchema24MigrationContract(
  name: string,
  create: () => Promise<MigrationHarness>,
): void {
  describe(`schema@2.4 migration — ${name}`, () => {
    let harness: MigrationHarness
    let db: DatabaseHandle

    /**
     * The pre-2.4 entry table: today's columns, yesterday's foreign key.
     *
     * Written out rather than generated, because the whole point is to start
     * from the constraint the generator no longer emits.
     */
    const createBrokenSchema = async (): Promise<void> => {
      const dialect = db.dialect
      const table = identifier(TABLE, dialect)

      await db.query(
        sql`create table ${table} (
          ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
          ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
          ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
          ${identifier('created_by', dialect)} ${textColumn(dialect, 64)},
          ${identifier('updated_by', dialect)} ${textColumn(dialect, 64)},
          ${identifier('status', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('deleted_at', dialect)} ${timestampColumn(dialect)},
          ${identifier('review_state', dialect)} ${textColumn(dialect, 24)} not null,
          ${identifier('assigned_reviewer', dialect)} ${textColumn(dialect, 64)},
          ${identifier('visibility', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('access_password', dialect)} ${textColumn(dialect, 255)},
          ${identifier('locale', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('translation_of', dialect)} ${uuidColumn(dialect)},
          ${identifier('version', dialect)} ${integerColumn()} not null,
          ${identifier('provenance', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('provenance_detail', dialect)} ${jsonColumn()},
          ${identifier('title', dialect)} ${textColumn(dialect, 200)},
          ${identifier('slug', dialect)} ${textColumn(dialect, 255)},
          ${identifier(TOPIC_COLUMN, dialect)} ${uuidColumn(dialect)},
          constraint ${identifier(indexName(TABLE, 'source_fk'), dialect)}
            foreign key (${identifier('translation_of', dialect)})
            references ${table} (${identifier('id', dialect)}) on delete set null,
          constraint ${identifier(indexName(TABLE, `${TOPIC_COLUMN}_fk`), dialect)}
            foreign key (${identifier(TOPIC_COLUMN, dialect)})
            references ${identifier(taxonomyTable(topic.name), dialect)}
              (${identifier('id', dialect)})
            on delete cascade
        )`,
      )

      await db.query(
        sql`create table ${identifier(versionsTable(article.name), dialect)} (
          ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
          ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
          ${identifier('version', dialect)} ${integerColumn()} not null,
          ${identifier('status', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('data', dialect)} ${jsonColumn()} not null,
          ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
          ${identifier('created_by', dialect)} ${textColumn(dialect, 64)},
          constraint ${identifier(indexName(versionsTable(article.name), 'entry_fk'), dialect)}
            foreign key (${identifier('entry_id', dialect)})
            references ${table} (${identifier('id', dialect)}) on delete cascade,
          constraint ${identifier(indexName(versionsTable(article.name), 'unique'), dialect)}
            unique (${identifier('entry_id', dialect)}, ${identifier('version', dialect)})
        )`,
      )

      await db.query(
        sql`create table ${identifier(blocksTable(article.name), dialect)} (
          ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
          ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
          ${identifier('version', dialect)} ${integerColumn()} not null,
          ${identifier('zone', dialect)} ${textColumn(dialect, 64)} not null,
          ${identifier('position', dialect)} ${integerColumn()} not null,
          ${identifier('block_key', dialect)} ${textColumn(dialect, 64)} not null,
          ${identifier('block_type', dialect)} ${textColumn(dialect, 64)} not null,
          ${identifier('data', dialect)} ${jsonColumn()} not null,
          constraint ${identifier(indexName(blocksTable(article.name), 'entry_fk'), dialect)}
            foreign key (${identifier('entry_id', dialect)})
            references ${table} (${identifier('id', dialect)}) on delete cascade,
          constraint ${identifier(indexName(blocksTable(article.name), 'unique'), dialect)}
            unique (${identifier('entry_id', dialect)}, ${identifier('version', dialect)},
                    ${identifier('zone', dialect)}, ${identifier('block_key', dialect)})
        )`,
      )

      const join = relationTable(article.name, 'tags')
      await db.query(
        sql`create table ${identifier(join, dialect)} (
          ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
          ${identifier('target_id', dialect)} ${uuidColumn(dialect)} not null,
          ${identifier('position', dialect)} ${integerColumn()} not null,
          primary key (${identifier('entry_id', dialect)}, ${identifier('target_id', dialect)}),
          constraint ${identifier(indexName(join, 'entry_fk'), dialect)}
            foreign key (${identifier('entry_id', dialect)})
            references ${table} (${identifier('id', dialect)}) on delete cascade,
          constraint ${identifier(indexName(join, 'target_fk'), dialect)}
            foreign key (${identifier('target_id', dialect)})
            references ${identifier(taxonomyTable(topic.name), dialect)}
              (${identifier('id', dialect)})
            on delete cascade
        )`,
      )

      for (const statement of [
        sql`create index ${identifier(indexName(TABLE, 'locale_status'), dialect)}
            on ${table} (${identifier('locale', dialect)}, ${identifier('status', dialect)})`,
        sql`create index ${identifier(indexName(TABLE, 'trash'), dialect)}
            on ${table} (${identifier('deleted_at', dialect)})`,
        sql`create unique index ${identifier(indexName(TABLE, 'slug_unique'), dialect)}
            on ${table} (${identifier('locale', dialect)}, ${identifier('slug', dialect)})`,
      ]) {
        await db.query(statement).catch(() => undefined)
      }
    }

    const migrator = () => createMigrator({ db, migrations: [schema24Migration({ collections })] })

    const confirmed = { confirmDestructive: true, backupVerified: true } as const

    const terms = () => createTaxonomyStore({ db, taxonomy: topic })
    const store = () => createContentStore({ db, collection: article, siblings: collections })

    const countRows = async (table: string): Promise<number> => {
      const result = await db.query<{ total: number | string }>(
        sql`select count(*) as total from ${identifier(table, db.dialect)}`,
      )
      return Number(result.rows[0]?.total ?? 0)
    }

    /**
     * An entry classified by a term, with a version, a block and a join row —
     * so that "nothing was lost" can be checked rather than hoped for.
     */
    const seed = async (): Promise<{ entry: string; term: string; tag: string }> => {
      const term = await terms().create({ slug: 'astronomy', labels: { en: 'Astronomy' } })
      const tag = await terms().create({ slug: 'telescopes', labels: { en: 'Telescopes' } })

      const entry = await store().create({
        values: {
          title: 'The transit of Venus',
          slug: 'transit-of-venus',
          topic: term.id,
          tags: [tag.id],
        },
      })
      await store().update(entry.id, { values: { title: 'The transit of Venus, revised' } })

      return { entry: entry.id, term: term.id, tag: tag.id }
    }

    const dropAll = async (): Promise<void> => {
      await dropSchemaTables(db, collections, taxonomies).catch(() => undefined)
      for (const table of ['cogenta_migrations', 'cogenta_migrations_lock']) {
        await db
          .query(sql`drop table if exists ${identifier(table, db.dialect)}`)
          .catch(() => undefined)
      }
    }

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      await dropAll()
      // Terms tables only: the collection's own tables are built by hand, in
      // the shape that predates the repair.
      await createSchemaTables(db, [], taxonomies)
      await createBrokenSchema()
    })

    afterEach(async () => {
      // `dispose` in a `finally`: it is what removes the temporary directory,
      // and `/tmp` here is a tmpfs — RAM. A teardown that threw before reaching
      // it leaked the directory, so a full `/tmp` produced failures that leaked
      // more of it.
      try {
        await dropAll()
        await db.close()
      } finally {
        await harness.dispose?.()
      }
    })

    it('starts from a schema where deleting a term really does delete the entries that carried it', async () => {
      const seeded = await seed()

      await terms().delete(seeded.term)

      // The bug, reproduced: not in the trash, gone.
      expect(await store().read(seeded.entry, { trashed: 'include', state: 'working' })).toBeNull()
      expect(await countRows(TABLE)).toBe(0)
    })

    it('refuses to run until the operator confirms and names a verified backup', async () => {
      await expect(migrator().up()).rejects.toMatchObject({ code: 'MIGRATION_DESTRUCTIVE' })
    })

    it('keeps an entry whose term was deleted, with only its taxonomy column emptied', async () => {
      const seeded = await seed()
      await migrator().up(confirmed)

      await terms().delete(seeded.term)

      const read = await store().read(seeded.entry, { state: 'working' })
      expect(read).not.toBeNull()
      expect(read?.values['title']).toBe('The transit of Venus, revised')
      expect(read?.values['topic']).toBeNull()
    })

    it('keeps every version and every block of the collection it rebuilds', async () => {
      await seed()
      const versionsBefore = await countRows(versionsTable(article.name))
      const blocksBefore = await countRows(blocksTable(article.name))
      const joinBefore = await countRows(relationTable(article.name, 'tags'))
      expect(versionsBefore).toBeGreaterThan(1)

      await migrator().up(confirmed)

      expect(await countRows(versionsTable(article.name))).toBe(versionsBefore)
      expect(await countRows(blocksTable(article.name))).toBe(blocksBefore)
      expect(await countRows(relationTable(article.name, 'tags'))).toBe(joinBefore)
      expect(await countRows(TABLE)).toBe(1)
    })

    it('leaves a many-valued taxonomy cascading, so deleting a term un-classifies instead of deleting', async () => {
      const seeded = await seed()
      await migrator().up(confirmed)

      await terms().delete(seeded.tag)

      expect(await countRows(relationTable(article.name, 'tags'))).toBe(0)
      const read = await store().read(seeded.entry, { state: 'working' })
      expect(read?.values['tags']).toEqual([])
    })

    it('keeps the unique index of the entries table, so two entries cannot share a slug', async () => {
      await seed()
      await migrator().up(confirmed)

      await expect(
        store().create({ values: { title: 'A duplicate', slug: 'transit-of-venus' } }),
      ).rejects.toBeTruthy()
    })

    it('leaves the store able to write and read the collection it rebuilt', async () => {
      await seed()
      await migrator().up(confirmed)

      const term = await terms().create({ slug: 'optics', labels: { en: 'Optics' } })
      const created = await store().create({
        values: { title: 'Refraction', slug: 'refraction', topic: term.id },
      })

      expect((await store().read(created.id, { state: 'working' }))?.values['topic']).toBe(term.id)
      expect(await countRows(TABLE)).toBe(2)
    })

    it('restores the previous, destructive behaviour when it is rolled back', async () => {
      const seeded = await seed()
      await migrator().up(confirmed)
      await migrator().down(confirmed)

      await terms().delete(seeded.term)

      expect(await store().read(seeded.entry, { trashed: 'include', state: 'working' })).toBeNull()
    })

    it('can be applied again after a rollback, ending where it started', async () => {
      const seeded = await seed()
      await migrator().up(confirmed)
      await migrator().down(confirmed)
      await migrator().up(confirmed)

      await terms().delete(seeded.term)

      expect((await store().read(seeded.entry, { state: 'working' }))?.values['topic']).toBeNull()
    })

    it('is safe to apply to a site that already has the repaired constraint', async () => {
      const seeded = await seed()
      await migrator().up(confirmed)
      // A second migrator with a fresh id: the same statements, on a table that
      // already carries `set null`. Re-running must be a no-op, not a failure.
      await createMigrator({
        db,
        migrations: [schema24Migration({ collections, id: '0099_schema_2_4_again' })],
      }).up(confirmed)

      await terms().delete(seeded.term)
      expect((await store().read(seeded.entry, { state: 'working' }))?.values['topic']).toBeNull()
    })
  })
}
