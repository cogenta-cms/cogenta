import process from 'node:process'
import { createMysqlHandle, createPostgresHandle, type DatabaseHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createCommentStore } from '../../src/store.js'
import { dropCommentsTables, ensureCommentsTables } from '../../src/tables.js'

/**
 * `ensureCommentsTables`/`dropCommentsTables` against real Postgres and
 * MySQL/MariaDB, on the same up/down/up + real write invariant as the SQLite
 * unit test — three dialects because a `varchar` length, a `boolean` column
 * and `create index if not exists` are each spelled differently across them
 * (`write-migration` skill).
 *
 * A missing service is skipped **loudly** (`describe.skip` naming the unset
 * variable), matching `@cogenta/commerce`'s established pattern for this
 * repository.
 */

function runContract(label: string, connect: () => Promise<DatabaseHandle>): void {
  describe(`comments tables — ${label}`, () => {
    it('up then down then up leaves the database writable, and drop really drops', async () => {
      const db = await connect()
      try {
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
        // The table was really dropped and recreated empty — the first
        // comment did not survive the round trip.
        expect(await store2.get(first.id)).toBeNull()
      } finally {
        await dropCommentsTables(db).catch(() => undefined)
        await db.close()
      }
    })
  })
}

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

function missing(label: string, variable: string): void {
  describe.skip(`comments tables — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runContract('postgres', () => createPostgresHandle({ url: postgresUrl, poolSize: 3 }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runContract('mysql', () => createMysqlHandle({ url: mysqlUrl, poolSize: 3 }))
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runContract('mariadb', () => createMysqlHandle({ url: mariadbUrl, poolSize: 3 }))
}
