import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { createMysqlSearch } from '../../src/search/mysql.js'
import { createPostgresSearch } from '../../src/search/postgres.js'
import { runSearchIndexingContract } from '../store/search-indexing.contract.js'

/**
 * The indexing contract against the real servers (L10 task 3).
 *
 * What it proves is not the ranking — that is `search.test.ts`'s job — but
 * that the write path keeps the index in step on every dialect: a published
 * entry appears, an unpublished edit does not, a delete disappears. Those are
 * transactions and upserts, and Postgres, MySQL and MariaDB spell all three
 * differently, so "it works on SQLite" is not the claim.
 *
 * A missing service is skipped **loudly**, naming the variable that was
 * unset, so a run that never reached Postgres reports a skipped suite rather
 * than a green tick that proves nothing.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`withSearchIndexing — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runSearchIndexingContract('postgres', async () => {
    const db = await createPostgresHandle({ url: postgresUrl, poolSize: 3 })
    return { db, index: await createPostgresSearch({ db }), dispose: () => db.close() }
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runSearchIndexingContract('mysql', async () => {
    const db = await createMysqlHandle({ url: mysqlUrl, poolSize: 3 })
    return { db, index: await createMysqlSearch({ db }), dispose: () => db.close() }
  })
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runSearchIndexingContract('mariadb', async () => {
    const db = await createMysqlHandle({ url: mariadbUrl, poolSize: 3 })
    return { db, index: await createMysqlSearch({ db }), dispose: () => db.close() }
  })
}
