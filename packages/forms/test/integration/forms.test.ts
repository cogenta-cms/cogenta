import process from 'node:process'
import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runFormsContract } from '../forms.contract.js'

/**
 * The same contract suite as the SQLite unit test, against the real servers.
 * A missing service is skipped **loudly** (same discipline as
 * `@cogenta/commerce`'s `test/integration/catalog.test.ts`), never silently
 * passed.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`FormStore contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runFormsContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runFormsContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runFormsContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
