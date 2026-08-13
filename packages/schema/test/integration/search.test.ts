import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { createMysqlSearch } from '../../src/search/mysql.js'
import { createPostgresSearch } from '../../src/search/postgres.js'
import { runSearchContract } from '../search/search.contract.js'

/**
 * The same contract suite as the SQLite unit test, against the real servers.
 *
 * A missing service is skipped **loudly**: a `describe.skip` whose name says
 * which variable was unset, so a run that never reached Postgres reports a
 * skipped suite rather than a green tick that proves nothing. `tsvector` and
 * `FULLTEXT` cannot be exercised any other way — there is no in-process
 * substitute, and mocking the database is forbidden.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`SearchDriver contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runSearchContract('postgres', async () => {
    const db = await createPostgresHandle({ url: postgresUrl, poolSize: 3 })
    return { db, index: await createPostgresSearch({ db }), dispose: () => db.close() }
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runSearchContract('mysql', async () => {
    const db = await createMysqlHandle({ url: mysqlUrl, poolSize: 3 })
    return { db, index: await createMysqlSearch({ db }), dispose: () => db.close() }
  })
}

// MariaDB is exercised separately from MySQL on purpose: their full-text
// implementations diverge — MariaDB's InnoDB fulltext is a different code base,
// and `on duplicate key update` is the only upsert both accept — so
// "MySQL-compatible" is not a claim this package makes untested.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runSearchContract('mariadb', async () => {
    const db = await createMysqlHandle({ url: mariadbUrl, poolSize: 3 })
    return { db, index: await createMysqlSearch({ db }), dispose: () => db.close() }
  })
}
