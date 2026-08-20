import { createSqliteHandle, identifier, sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createCommentStore } from '../src/store.js'
import { dropCommentsTables, ensureCommentsTables, TABLES } from '../src/tables.js'

describe('ensureCommentsTables / dropCommentsTables', () => {
  it('up then down then up leaves the database able to take writes again', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })

    await ensureCommentsTables(db)
    const store = createCommentStore({ db })
    const first = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Alice', email: 'alice@example.com' },
      body: 'Hello there.',
      status: 'approved',
    })
    expect(first.id).toBeTruthy()

    await dropCommentsTables(db)
    for (const table of Object.values(TABLES)) {
      await expect(
        db.query(sql`select * from ${identifier(table, db.dialect)}`),
      ).rejects.toBeTruthy()
    }

    await ensureCommentsTables(db)
    const store2 = createCommentStore({ db })
    const second = await store2.create({
      collection: 'post',
      entryId: 'e2',
      author: { name: 'Bob', email: 'bob@example.com' },
      body: 'Another one.',
      status: 'pending',
    })
    expect(second.id).toBeTruthy()
    expect(second.id).not.toBe(first.id)

    await db.close()
  })

  it('is idempotent — calling ensure twice does not fail', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await ensureCommentsTables(db)
    await ensureCommentsTables(db)
    await db.close()
  })
})
