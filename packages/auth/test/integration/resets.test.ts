import process from 'node:process'
import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runPasswordResetContract } from '../resets.contract.js'

/**
 * The same contract suite as the SQLite unit test, against the real servers.
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the unset
 * variable, so a run that never reached Postgres reports a skip rather than a
 * green tick that proves nothing. The claim being checked here is dialect
 * sensitive on purpose — single use rests on `update ... where used_at is
 * null` reporting `rowsAffected` the same way everywhere, and MySQL in
 * particular has its own opinion about what "affected" means.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`PasswordResetStore contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runPasswordResetContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runPasswordResetContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

// MariaDB separately from MySQL: "MySQL-compatible" is not a claim this
// project makes untested.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runPasswordResetContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
