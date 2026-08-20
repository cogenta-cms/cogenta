import { createMigrator, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { defineTaxonomy } from '../../src/define-taxonomy.js'
import { f } from '../../src/fields.js'
import { newId } from '../../src/id.js'
import {
  integerColumn,
  jsonColumn,
  textColumn,
  timestampColumn,
  uuidColumn,
} from '../../src/store/columns.js'
import {
  blocksTable,
  entriesTable,
  relationTable,
  taxonomyTable,
  versionsTable,
} from '../../src/store/naming.js'
import { schema21Migration } from '../../src/store/schema-2-1-migration.js'
import { schema2Migration } from '../../src/store/schema-2-migration.js'
import { createContentStore } from '../../src/store/store.js'
import { createTaxonomyStore } from '../../src/store/taxonomy-store.js'

export interface MigrationHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The `schema@1.0 → 2.0` migration, run for real (ADR-0022).
 *
 * The point of this suite is that the migration is exercised against a table
 * that genuinely has the **1.0** shape — built here by hand, column for
 * column — rather than against the 2.0 shape `createSchemaTables` produces.
 * Testing a migration against the schema it was supposed to produce proves
 * nothing at all.
 *
 * The project has no site in production, so nothing real is being moved. The
 * migration is written and tested as if there were, because the day there is
 * one is not the day to find out whether the rollback works.
 */

const category = defineTaxonomy({
  name: 'mig_category',
  labels: { singular: { fr: 'Catégorie' } },
  hierarchical: true,
  permissions: { read: ['public'], create: ['editor'] },
})

const article = defineCollection({
  name: 'mig_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    categories: f.taxonomy({ of: 'mig_category', many: true }),
  },
  permissions: { read: ['public'], create: ['editor'], delete: ['admin'] },
})

export function runSchema2MigrationContract(
  name: string,
  create: () => Promise<MigrationHarness>,
): void {
  describe(`schema@2.0 migration — ${name}`, () => {
    let harness: MigrationHarness
    let db: DatabaseHandle

    /**
     * The 1.0 entry table, exactly as contract A froze it on 2026-08-13 —
     * the same column helpers the engine uses, minus `deleted_at`, which is
     * precisely what this migration is here to add.
     */
    const createV1Table = async (): Promise<void> => {
      const dialect = db.dialect
      const table = identifier(entriesTable(article.name), dialect)

      await db.query(
        sql`create table ${table} (
          ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
          ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
          ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
          ${identifier('created_by', dialect)} ${textColumn(dialect, 64)},
          ${identifier('updated_by', dialect)} ${textColumn(dialect, 64)},
          ${identifier('status', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('locale', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('translation_of', dialect)} ${uuidColumn(dialect)},
          ${identifier('version', dialect)} ${integerColumn()} not null,
          ${identifier('provenance', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('provenance_detail', dialect)} ${jsonColumn()},
          ${identifier('title', dialect)} ${textColumn(dialect, 200)}
        )`,
      )

      // The two side tables 1.0 already had. The migration does not touch
      // them, but the store needs them to write anything at all.
      await db.query(
        sql`create table ${identifier(versionsTable(article.name), dialect)} (
          ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
          ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
          ${identifier('version', dialect)} ${integerColumn()} not null,
          ${identifier('status', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('data', dialect)} ${jsonColumn()} not null,
          ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
          ${identifier('created_by', dialect)} ${textColumn(dialect, 64)},
          constraint ${identifier(`${versionsTable(article.name)}_entry_fk`, dialect)}
            foreign key (${identifier('entry_id', dialect)})
            references ${table} (${identifier('id', dialect)}) on delete cascade
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
          constraint ${identifier(`${blocksTable(article.name)}_entry_fk`, dialect)}
            foreign key (${identifier('entry_id', dialect)})
            references ${table} (${identifier('id', dialect)}) on delete cascade
        )`,
      )
    }

    const tableExists = async (table: string): Promise<boolean> => {
      try {
        await db.query(sql`select 1 from ${identifier(table, db.dialect)}`)
        return true
      } catch {
        return false
      }
    }

    const columnExists = async (table: string, column: string): Promise<boolean> => {
      try {
        await db.query(
          sql`select ${identifier(column, db.dialect)} from ${identifier(table, db.dialect)}`,
        )
        return true
      } catch {
        return false
      }
    }

    const dropAll = async (): Promise<void> => {
      const dialect = db.dialect
      for (const table of [
        relationTable(article.name, 'categories'),
        blocksTable(article.name),
        versionsTable(article.name),
        entriesTable(article.name),
        taxonomyTable(category.name),
        'cogenta_migrations',
        'cogenta_migrations_lock',
      ]) {
        await db
          .query(sql`drop table if exists ${identifier(table, dialect)}`)
          .catch(() => undefined)
      }
    }

    // `createContentStore` targets the *current* shape (`schema@2.1`), so a
    // test that exercises the live store after migrating up has to bring the
    // table all the way there — `schema2Migration` on its own only proves the
    // 1.0 → 2.0 step, which is still exactly what most of this file checks.
    const migrator = () =>
      createMigrator({
        db,
        migrations: [
          schema2Migration({ collections: [article], taxonomies: [category] }),
          schema21Migration({ collections: [article] }),
        ],
      })

    /** A destructive migration demands both, in both directions. */
    const confirmed = { confirmDestructive: true, backupVerified: true } as const

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      await dropAll()
      await createV1Table()
    })

    afterEach(async () => {
      await dropAll()
      await db.close()
      await harness.dispose?.()
    })

    it('refuses to run at all without an explicit confirmation and a verified backup', async () => {
      // The rollback discards the trash, which is a real data loss under the
      // project's rule on destructive migrations.
      await expect(migrator().up()).rejects.toMatchObject({ code: 'MIGRATION_DESTRUCTIVE' })
      expect(await columnExists(entriesTable(article.name), 'deleted_at')).toBe(false)
    })

    it('adds the trash column and the taxonomy tables to a 1.0 database', async () => {
      const seeded = newId()
      await db.query(
        sql`insert into ${identifier(entriesTable(article.name), db.dialect)}
            (${identifier('id', db.dialect)}, ${identifier('created_at', db.dialect)},
             ${identifier('updated_at', db.dialect)}, ${identifier('created_by', db.dialect)},
             ${identifier('updated_by', db.dialect)}, ${identifier('status', db.dialect)},
             ${identifier('locale', db.dialect)}, ${identifier('translation_of', db.dialect)},
             ${identifier('version', db.dialect)}, ${identifier('provenance', db.dialect)},
             ${identifier('provenance_detail', db.dialect)}, ${identifier('title', db.dialect)})
            values (${seeded}, ${'2026-08-13T09:00:00.000Z'}, ${'2026-08-13T09:00:00.000Z'},
                    ${null}, ${null}, ${'published'}, ${'fr'}, ${null}, ${1}, ${'human'},
                    ${null}, ${'Écrit avant la 2.0'})`,
      )

      await migrator().up(confirmed)

      expect(await columnExists(entriesTable(article.name), 'deleted_at')).toBe(true)
      expect(await tableExists(taxonomyTable(category.name))).toBe(true)
      expect(await tableExists(relationTable(article.name, 'categories'))).toBe(true)

      // The content written under 1.0 is still there, and is now readable
      // through the 2.0 store with a null deletedAt — not a trashed entry.
      const store = createContentStore({ db, collection: article, siblings: [article] })
      const read = await store.read(seeded)
      expect(read?.values['title']).toBe('Écrit avant la 2.0')
      expect(read?.deletedAt).toBeNull()
    })

    it('leaves a working trash and a working taxonomy behind it', async () => {
      await migrator().up(confirmed)

      const terms = createTaxonomyStore({ db, taxonomy: category })
      const store = createContentStore({ db, collection: article, siblings: [article] })

      const root = await terms.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
      const child = await terms.create({
        slug: 'desserts',
        labels: { fr: 'Desserts' },
        parent: root.id,
      })
      expect(child.path).toBe(`/${root.id}/${child.id}/`)

      const entry = await store.create({ values: { title: 'Tarte', categories: [root.id] } })
      await store.delete(entry.id)
      expect(await store.read(entry.id, { state: 'working' })).toBeNull()
      expect(await store.read(entry.id, { state: 'working', trashed: 'only' })).not.toBeNull()
    })

    it('reverses cleanly, keeping the content and losing only the trash', async () => {
      await migrator().up(confirmed)

      const store = createContentStore({ db, collection: article, siblings: [article] })
      const kept = await store.create({ values: { title: 'Gardé' } })
      const trashed = await store.create({ values: { title: 'Jeté' } })
      await store.delete(trashed.id)

      await migrator().down({ ...confirmed, steps: 2 })

      expect(await columnExists(entriesTable(article.name), 'deleted_at')).toBe(false)
      expect(await tableExists(taxonomyTable(category.name))).toBe(false)
      expect(await tableExists(relationTable(article.name, 'categories'))).toBe(false)

      // Both rows survive the rollback — but the trashed one is now
      // indistinguishable from the live one, which is exactly the data loss
      // the migration's `impact` warns about.
      const rows = await db.query<{ id: string }>(
        sql`select ${identifier('id', db.dialect)} from ${identifier(entriesTable(article.name), db.dialect)}`,
      )
      expect(rows.rows.map((row) => String(row.id)).sort()).toEqual([kept.id, trashed.id].sort())
    })

    it('can be applied again after a rollback, ending where it started', async () => {
      await migrator().up(confirmed)
      await migrator().down({ ...confirmed, steps: 2 })
      await migrator().up(confirmed)

      expect(await columnExists(entriesTable(article.name), 'deleted_at')).toBe(true)
      expect(await tableExists(taxonomyTable(category.name))).toBe(true)
    })
  })
}
