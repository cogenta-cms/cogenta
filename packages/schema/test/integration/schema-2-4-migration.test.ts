import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runSchema24MigrationContract } from '../store/schema-2-4-migration.contract.js'

/**
 * The same `schema@2.4` contract as the SQLite unit test, against the real
 * servers.
 *
 * It carries more weight here than most suites do, because the three dialects
 * repair the constraint by three genuinely different routes: `drop constraint`
 * on Postgres, `drop foreign key` on MySQL and MariaDB — where DDL commits
 * implicitly, so the drop/add pair is not atomic — and a full table rebuild on
 * SQLite. Only one contract describes the behaviour; until this file has run,
 * "the same on all three" is an intention.
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the
 * variable, so a run that could not reach Postgres says so instead of showing
 * a green tick that means nothing.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`schema@2.4 migration — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runSchema24MigrationContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runSchema24MigrationContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

// MariaDB separately from MySQL, as everywhere else in this repository: they
// differ on RETURNING and on types, so "MySQL-compatible" is never an untested
// claim here.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runSchema24MigrationContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
