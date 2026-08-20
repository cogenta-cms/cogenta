import { createMigrator, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { f } from '../../src/fields.js'
import { newId } from '../../src/id.js'
import {
  integerColumn,
  jsonColumn,
  textColumn,
  timestampColumn,
  uuidColumn,
} from '../../src/store/columns.js'
import { blocksTable, entriesTable, versionsTable } from '../../src/store/naming.js'
import { schema21Migration } from '../../src/store/schema-2-1-migration.js'
import { createContentStore } from '../../src/store/store.js'

export interface MigrationHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The `schema@2.0 → 2.1` migration, run for real (ADR-0027).
 *
 * Built against a table with the genuine **2.0** shape — `deleted_at`
 * included, `review_state`/`assigned_reviewer` absent — never against what
 * `createSchemaTables` already produces post-migration: testing a migration
 * against the schema it is supposed to produce proves nothing (the same
 * discipline `schema-2-migration.contract.ts` follows).
 */

const article = defineCollection({
  name: 'mig21_article',
  labels: { singular: 'Article', plural: 'Articles' },
  workflow: { enabled: true },
  fields: {
    title: f.text({ required: true, max: 200 }),
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    publish: ['admin'],
  },
})

export function runSchema21MigrationContract(
  name: string,
  create: () => Promise<MigrationHarness>,
): void {
  describe(`schema@2.1 migration — ${name}`, () => {
    let harness: MigrationHarness
    let db: DatabaseHandle

    /** The 2.0 entry table, column for column, minus `review_state`/`assigned_reviewer`. */
    const createV20Table = async (): Promise<void> => {
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
          ${identifier('deleted_at', dialect)} ${timestampColumn(dialect)},
          ${identifier('locale', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('translation_of', dialect)} ${uuidColumn(dialect)},
          ${identifier('version', dialect)} ${integerColumn()} not null,
          ${identifier('provenance', dialect)} ${textColumn(dialect, 16)} not null,
          ${identifier('provenance_detail', dialect)} ${jsonColumn()},
          ${identifier('title', dialect)} ${textColumn(dialect, 200)}
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
        blocksTable(article.name),
        versionsTable(article.name),
        entriesTable(article.name),
        'cogenta_migrations',
        'cogenta_migrations_lock',
      ]) {
        await db
          .query(sql`drop table if exists ${identifier(table, dialect)}`)
          .catch(() => undefined)
      }
    }

    const migrator = () =>
      createMigrator({ db, migrations: [schema21Migration({ collections: [article] })] })

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      await dropAll()
      await createV20Table()
    })

    afterEach(async () => {
      await dropAll()
      await db.close()
      await harness.dispose?.()
    })

    it('is not destructive, and runs with no confirmation at all', async () => {
      await migrator().up()
      expect(await columnExists(entriesTable(article.name), 'review_state')).toBe(true)
    })

    it('gives every row written before it a reviewState of "none" — the compatibility a client reading only status relies on', async () => {
      const seeded = newId()
      await db.query(
        sql`insert into ${identifier(entriesTable(article.name), db.dialect)}
            (${identifier('id', db.dialect)}, ${identifier('created_at', db.dialect)},
             ${identifier('updated_at', db.dialect)}, ${identifier('created_by', db.dialect)},
             ${identifier('updated_by', db.dialect)}, ${identifier('status', db.dialect)},
             ${identifier('deleted_at', db.dialect)}, ${identifier('locale', db.dialect)},
             ${identifier('translation_of', db.dialect)}, ${identifier('version', db.dialect)},
             ${identifier('provenance', db.dialect)}, ${identifier('provenance_detail', db.dialect)},
             ${identifier('title', db.dialect)})
            values (${seeded}, ${'2026-08-16T09:00:00.000Z'}, ${'2026-08-16T09:00:00.000Z'},
                    ${null}, ${null}, ${'published'}, ${null}, ${'fr'}, ${null}, ${1},
                    ${'human'}, ${null}, ${'Écrit avant la 2.1'})`,
      )

      await migrator().up()

      const store = createContentStore({ db, collection: article, siblings: [article] })
      const read = await store.read(seeded)
      // The property the fiche asks to be proved, not assumed: exactly the
      // same `status` value a pre-2.1 client always saw.
      expect(read?.status).toBe('published')
      expect(read?.reviewState).toBe('none')
      expect(read?.assignedReviewer).toBeNull()
    })

    it('lets a real submit/approve cycle run once the column exists', async () => {
      await migrator().up()

      const store = createContentStore({ db, collection: article, siblings: [article] })
      const entry = await store.create({ values: { title: 'Cycle complet' } })
      expect(entry.reviewState).toBe('none')

      const submitted = await store.submitForReview(entry.id, { reviewerId: 'editor-1' })
      expect(submitted.reviewState).toBe('pending')
      expect(submitted.assignedReviewer).toBe('editor-1')

      const approved = await store.approveReview(entry.id, { by: 'editor-1' })
      expect(approved.reviewState).toBe('approved')
      expect(approved.status).not.toBe('published')
    })

    it('reverses cleanly, dropping both columns', async () => {
      await migrator().up()
      await migrator().down()

      expect(await columnExists(entriesTable(article.name), 'review_state')).toBe(false)
      expect(await columnExists(entriesTable(article.name), 'assigned_reviewer')).toBe(false)
    })

    it('can be applied again after a rollback, ending where it started', async () => {
      await migrator().up()
      await migrator().down()
      await migrator().up()

      expect(await columnExists(entriesTable(article.name), 'review_state')).toBe(true)
      expect(await columnExists(entriesTable(article.name), 'assigned_reviewer')).toBe(true)
    })
  })
}
