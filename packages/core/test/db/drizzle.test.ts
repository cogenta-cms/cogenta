import { eq } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createPostgresDrizzle,
  createSqliteDrizzle,
  createSqliteHandle,
  type DatabaseHandle,
  drizzleTransaction,
  sql,
} from '../../src/db/index.js'

// L0 has no business model, so the schema lives in the test: what is being
// proved is the wiring, not a table Cogenta will ship. Both tables carry a
// column called `name` on purpose — a join then selects two columns with the
// same name, which is where a proxy that maps rows by key rather than by
// position quietly returns the wrong data.
const items = sqliteTable('drizzle_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
})

const tags = sqliteTable('drizzle_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull(),
  name: text('name').notNull(),
})

describe('Drizzle on SQLite', () => {
  let handle: DatabaseHandle

  beforeEach(async () => {
    handle = await createSqliteHandle({ url: ':memory:' })
    await handle.query(
      sql`create table drizzle_items (
        id integer primary key autoincrement,
        name text not null,
        active integer not null
      )`,
    )
    await handle.query(
      sql`create table drizzle_tags (
        id integer primary key autoincrement,
        item_id integer not null,
        name text not null
      )`,
    )
  })

  afterEach(async () => {
    await handle.close()
  })

  it('inserts a row and reads it back through the query builder', async () => {
    const db = createSqliteDrizzle(handle)

    await db.insert(items).values({ name: 'first', active: true })

    const rows = await db.select().from(items)
    expect(rows).toEqual([{ id: 1, name: 'first', active: true }])
  })

  it('gives back the row the database generated when asked to return it', async () => {
    const db = createSqliteDrizzle(handle)

    const returned = await db.insert(items).values({ name: 'made', active: false }).returning()
    expect(returned).toEqual([{ id: 1, name: 'made', active: false }])
  })

  it('updates only the rows the filter matches', async () => {
    const db = createSqliteDrizzle(handle)
    await db.insert(items).values([
      { name: 'keep', active: true },
      { name: 'change', active: true },
    ])

    await db.update(items).set({ name: 'changed' }).where(eq(items.name, 'change'))

    const names = (await db.select({ name: items.name }).from(items)).map((row) => row.name)
    expect(names.sort()).toEqual(['changed', 'keep'])
  })

  it('deletes only the rows the filter matches', async () => {
    const db = createSqliteDrizzle(handle)
    await db.insert(items).values([
      { name: 'a', active: true },
      { name: 'b', active: false },
    ])

    await db.delete(items).where(eq(items.active, false))

    expect(await db.select().from(items)).toEqual([{ id: 1, name: 'a', active: true }])
  })

  it('maps a join correctly although both tables have a column called name', async () => {
    const db = createSqliteDrizzle(handle)
    await db.insert(items).values({ name: 'article', active: true })
    await db.insert(tags).values({ itemId: 1, name: 'draft' })

    const joined = await db.select().from(items).innerJoin(tags, eq(tags.itemId, items.id))

    expect(joined).toEqual([
      {
        drizzle_items: { id: 1, name: 'article', active: true },
        drizzle_tags: { id: 1, itemId: 1, name: 'draft' },
      },
    ])
  })

  it('answers nothing, not an empty row, when a single-row read matches nothing', async () => {
    const db = createSqliteDrizzle(handle)

    expect(await db.select().from(items).where(eq(items.id, 404)).get()).toBeUndefined()
  })

  it('commits every statement of a transaction that returns', async () => {
    await drizzleTransaction(
      handle,
      (tx) => createSqliteDrizzle(tx),
      async (db) => {
        await db.insert(items).values({ name: 'one', active: true })
        await db.insert(items).values({ name: 'two', active: true })
      },
    )

    const db = createSqliteDrizzle(handle)
    expect(await db.select().from(items)).toHaveLength(2)
  })

  it('rolls back every statement of a transaction that throws', async () => {
    await expect(
      drizzleTransaction(
        handle,
        (tx) => createSqliteDrizzle(tx),
        async (db) => {
          await db.insert(items).values({ name: 'one', active: true })
          throw new Error('changed my mind')
        },
      ),
    ).rejects.toThrowError('changed my mind')

    const db = createSqliteDrizzle(handle)
    expect(await db.select().from(items)).toEqual([])
  })

  it('takes the write lock up front when the transaction asks for it', async () => {
    await drizzleTransaction(
      handle,
      (tx) => createSqliteDrizzle(tx),
      async (db) => {
        await db.select().from(items)
        await db.insert(items).values({ name: 'read-modify-write', active: true })
      },
      { immediate: true },
    )

    expect(await createSqliteDrizzle(handle).select().from(items)).toHaveLength(1)
  })

  it('refuses to render Postgres SQL onto a SQLite connection', () => {
    expect(() => createPostgresDrizzle(handle)).toThrowError(
      /writes postgres SQL, but the connection speaks sqlite/,
    )
  })
})
