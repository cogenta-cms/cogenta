import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runSearchConsoleStoreContract } from '../store/search-console-store.contract.js'

/**
 * The same Search Console connection store contract as the SQLite unit
 * test, against the real servers (fiche 70 task 4, ADR-0032).
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the
 * variable, so a run that could not reach a service says so instead of
 * showing a green tick that means nothing — the same discipline
 * `pattern-store`'s own integration suite already follows.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`Search Console connection store contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runSearchConsoleStoreContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runSearchConsoleStoreContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runSearchConsoleStoreContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
