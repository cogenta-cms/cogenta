import { eq } from 'drizzle-orm'
import { int, boolean as mysqlBoolean, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { integer, boolean as pgBoolean, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMysqlDrizzle,
  createMysqlHandle,
  createPostgresDrizzle,
  createPostgresHandle,
  type DatabaseHandle,
  drizzleTransaction,
  sql,
} from '../../src/db/index.js'

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

// L0 ships no business model, so the schema lives in the test: what is proved
// here is the wiring. Both tables carry a column called `name` on purpose — a
// join then selects two columns with the same name, which is exactly where a
// bridge that maps rows by key instead of by position returns the wrong data.
const pgItems = pgTable('drizzle_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  active: pgBoolean('active').notNull(),
})

const pgTags = pgTable('drizzle_tags', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull(),
  name: text('name').notNull(),
})

const myItems = mysqlTable('drizzle_items', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  active: mysqlBoolean('active').notNull(),
})

const myTags = mysqlTable('drizzle_tags', {
  id: int('id').autoincrement().primaryKey(),
  itemId: int('item_id').notNull(),
  name: varchar('name', { length: 200 }).notNull(),
})

if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('Drizzle on Postgres', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  const url = postgresUrl

  describe('Drizzle on Postgres', () => {
    let handle: DatabaseHandle

    beforeEach(async () => {
      handle = await createPostgresHandle({ url, poolSize: 3 })
      await handle.query(sql`drop table if exists drizzle_tags`)
      await handle.query(sql`drop table if exists drizzle_items`)
      await handle.query(
        sql`create table drizzle_items (
          id serial primary key,
          name text not null,
          active boolean not null
        )`,
      )
      await handle.query(
        sql`create table drizzle_tags (
          id serial primary key,
          item_id integer not null,
          name text not null
        )`,
      )
    })

    afterEach(async () => {
      await handle.query(sql`drop table if exists drizzle_tags`)
      await handle.query(sql`drop table if exists drizzle_items`)
      await handle.close()
    })

    it('inserts a row and reads it back through the query builder', async () => {
      const db = createPostgresDrizzle(handle)

      await db.insert(pgItems).values({ name: 'first', active: true })

      expect(await db.select().from(pgItems)).toEqual([{ id: 1, name: 'first', active: true }])
    })

    it('gives back the row the database generated when asked to return it', async () => {
      const db = createPostgresDrizzle(handle)

      const returned = await db.insert(pgItems).values({ name: 'made', active: false }).returning()
      expect(returned).toEqual([{ id: 1, name: 'made', active: false }])
    })

    it('updates only the rows the filter matches', async () => {
      const db = createPostgresDrizzle(handle)
      await db.insert(pgItems).values([
        { name: 'keep', active: true },
        { name: 'change', active: true },
      ])

      await db.update(pgItems).set({ name: 'changed' }).where(eq(pgItems.name, 'change'))

      const names = (await db.select({ name: pgItems.name }).from(pgItems)).map((row) => row.name)
      expect(names.sort()).toEqual(['changed', 'keep'])
    })

    it('deletes only the rows the filter matches', async () => {
      const db = createPostgresDrizzle(handle)
      await db.insert(pgItems).values([
        { name: 'a', active: true },
        { name: 'b', active: false },
      ])

      await db.delete(pgItems).where(eq(pgItems.active, false))

      expect(await db.select().from(pgItems)).toEqual([{ id: 1, name: 'a', active: true }])
    })

    it('maps a join correctly although both tables have a column called name', async () => {
      const db = createPostgresDrizzle(handle)
      await db.insert(pgItems).values({ name: 'article', active: true })
      await db.insert(pgTags).values({ itemId: 1, name: 'draft' })

      const joined = await db
        .select()
        .from(pgItems)
        .innerJoin(pgTags, eq(pgTags.itemId, pgItems.id))

      expect(joined).toEqual([
        {
          drizzle_items: { id: 1, name: 'article', active: true },
          drizzle_tags: { id: 1, itemId: 1, name: 'draft' },
        },
      ])
    })

    it('commits every statement of a transaction that returns', async () => {
      await drizzleTransaction(
        handle,
        (tx) => createPostgresDrizzle(tx),
        async (db) => {
          await db.insert(pgItems).values({ name: 'one', active: true })
          await db.insert(pgItems).values({ name: 'two', active: true })
        },
      )

      expect(await createPostgresDrizzle(handle).select().from(pgItems)).toHaveLength(2)
    })

    it('rolls back every statement of a transaction that throws', async () => {
      await expect(
        drizzleTransaction(
          handle,
          (tx) => createPostgresDrizzle(tx),
          async (db) => {
            await db.insert(pgItems).values({ name: 'one', active: true })
            throw new Error('changed my mind')
          },
        ),
      ).rejects.toThrowError('changed my mind')

      expect(await createPostgresDrizzle(handle).select().from(pgItems)).toEqual([])
    })

    it('still binds a Date on the raw handle once Drizzle is attached', async () => {
      // The reason this bridge goes through the proxy rather than through
      // drizzle-orm/postgres-js: that driver rewrites the serialisers of the
      // client it is handed, and the handle sharing it could no longer bind a
      // Date. Attaching a Drizzle instance must change nothing here.
      createPostgresDrizzle(handle)

      await handle.query(sql`drop table if exists drizzle_dates`)
      await handle.query(sql`create table drizzle_dates (at timestamptz not null)`)
      await handle.query(sql`insert into drizzle_dates (at) values (${new Date(0)})`)

      const rows = await handle.query<{ at: Date }>(sql`select at from drizzle_dates`)
      expect(rows.rows[0]?.at).toBeInstanceOf(Date)

      await handle.query(sql`drop table drizzle_dates`)
    })
  })
}

/**
 * MariaDB runs the same suite as MySQL rather than being assumed compatible: it
 * has RETURNING and a native VECTOR type that MySQL Community does not, so the
 * two are not the same server behind one driver.
 */
function runMysqlDrizzleSuite(name: string, url: string): void {
  describe(`Drizzle on ${name}`, () => {
    let handle: DatabaseHandle

    beforeEach(async () => {
      handle = await createMysqlHandle({ url, poolSize: 3 })
      await handle.query(sql`drop table if exists drizzle_tags`)
      await handle.query(sql`drop table if exists drizzle_items`)
      await handle.query(
        sql`create table drizzle_items (
          id int auto_increment primary key,
          name varchar(200) not null,
          active tinyint not null
        )`,
      )
      await handle.query(
        sql`create table drizzle_tags (
          id int auto_increment primary key,
          item_id int not null,
          name varchar(200) not null
        )`,
      )
    })

    afterEach(async () => {
      await handle.query(sql`drop table if exists drizzle_tags`)
      await handle.query(sql`drop table if exists drizzle_items`)
      await handle.close()
    })

    it('inserts a row and reads it back through the query builder', async () => {
      const db = createMysqlDrizzle(handle)

      await db.insert(myItems).values({ name: 'first', active: true })

      expect(await db.select().from(myItems)).toEqual([{ id: 1, name: 'first', active: true }])
    })

    it('reports the key MySQL generated, which it has no RETURNING to give', async () => {
      const db = createMysqlDrizzle(handle)

      const returned = await db
        .insert(myItems)
        .values({ name: 'made', active: false })
        .$returningId()
      expect(returned).toEqual([{ id: 1 }])
    })

    it('updates only the rows the filter matches', async () => {
      const db = createMysqlDrizzle(handle)
      await db.insert(myItems).values([
        { name: 'keep', active: true },
        { name: 'change', active: true },
      ])

      await db.update(myItems).set({ name: 'changed' }).where(eq(myItems.name, 'change'))

      const names = (await db.select({ name: myItems.name }).from(myItems)).map((row) => row.name)
      expect(names.sort()).toEqual(['changed', 'keep'])
    })

    it('deletes only the rows the filter matches', async () => {
      const db = createMysqlDrizzle(handle)
      await db.insert(myItems).values([
        { name: 'a', active: true },
        { name: 'b', active: false },
      ])

      await db.delete(myItems).where(eq(myItems.active, false))

      expect(await db.select().from(myItems)).toEqual([{ id: 1, name: 'a', active: true }])
    })

    it('maps a join correctly although both tables have a column called name', async () => {
      const db = createMysqlDrizzle(handle)
      await db.insert(myItems).values({ name: 'article', active: true })
      await db.insert(myTags).values({ itemId: 1, name: 'draft' })

      const joined = await db
        .select()
        .from(myItems)
        .innerJoin(myTags, eq(myTags.itemId, myItems.id))

      expect(joined).toEqual([
        {
          drizzle_items: { id: 1, name: 'article', active: true },
          drizzle_tags: { id: 1, itemId: 1, name: 'draft' },
        },
      ])
    })

    it('commits every statement of a transaction that returns', async () => {
      await drizzleTransaction(
        handle,
        (tx) => createMysqlDrizzle(tx),
        async (db) => {
          await db.insert(myItems).values({ name: 'one', active: true })
          await db.insert(myItems).values({ name: 'two', active: true })
        },
      )

      expect(await createMysqlDrizzle(handle).select().from(myItems)).toHaveLength(2)
    })

    it('rolls back every statement of a transaction that throws', async () => {
      await expect(
        drizzleTransaction(
          handle,
          (tx) => createMysqlDrizzle(tx),
          async (db) => {
            await db.insert(myItems).values({ name: 'one', active: true })
            throw new Error('changed my mind')
          },
        ),
      ).rejects.toThrowError('changed my mind')

      expect(await createMysqlDrizzle(handle).select().from(myItems)).toEqual([])
    })
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  describe.skip('Drizzle on MySQL', () => {
    it('skipped: COGENTA_TEST_MYSQL_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMysqlDrizzleSuite('MySQL', mysqlUrl)
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  describe.skip('Drizzle on MariaDB', () => {
    it('skipped: COGENTA_TEST_MARIADB_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMysqlDrizzleSuite('MariaDB', mariadbUrl)
}
