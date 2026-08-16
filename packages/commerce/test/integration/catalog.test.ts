import process from 'node:process'
import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runCatalogContract } from '../catalog.contract.js'

/**
 * The same contract suite as the SQLite unit test, against the real servers.
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the unset
 * variable, so a run that never reached Postgres reports a skip rather than a
 * green tick that proves nothing.
 *
 * These claims are dialect sensitive, and money makes that expensive rather
 * than merely annoying. Three in particular:
 *
 * - stock safety rests on `update … where on_hand >= n` reporting
 *   `rowsAffected` the same way everywhere, and **MySQL has its own opinion
 *   about what "affected" means** when an update matches a row but changes
 *   nothing (`CLIENT_FOUND_ROWS`). If that differs, an oversell is silent.
 * - every amount is a `bigint`, and `pg` hands `int8` back as a **string**. A
 *   price read as `"1999"` and added to another is `"19991999"`, which is a
 *   bug that appears only on Postgres and only in production.
 * - `create index if not exists` does not exist on older MySQL, so the schema
 *   itself has a dialect branch that only running it can check.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`CatalogStore contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runCatalogContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runCatalogContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

// MariaDB separately from MySQL: "MySQL-compatible" is not a claim this
// project makes untested.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runCatalogContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
