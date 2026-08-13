import process from 'node:process'
import { describe, it } from 'vitest'
import { createMysqlHandle, createPostgresHandle } from '../../src/db/index.js'
import { databaseQueueHarness } from '../queue/database-harness.js'
import { runQueueContract } from '../queue/queue.contract.js'

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

// The claim query relies on FOR UPDATE SKIP LOCKED here, and on the write lock
// on SQLite. Two different mechanisms have to produce the same guarantee, which
// is exactly why they run the same suite.
if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('Queue on Postgres', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runQueueContract(
    'postgres',
    databaseQueueHarness(() =>
      Promise.resolve({ open: () => createPostgresHandle({ url: postgresUrl, poolSize: 2 }) }),
    ),
  )
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  describe.skip('Queue on MySQL', () => {
    it('skipped: COGENTA_TEST_MYSQL_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runQueueContract(
    'mysql',
    databaseQueueHarness(() =>
      Promise.resolve({ open: () => createMysqlHandle({ url: mysqlUrl, poolSize: 2 }) }),
    ),
  )
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  describe.skip('Queue on MariaDB', () => {
    it('skipped: COGENTA_TEST_MARIADB_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runQueueContract(
    'mariadb',
    databaseQueueHarness(() =>
      Promise.resolve({ open: () => createMysqlHandle({ url: mariadbUrl, poolSize: 2 }) }),
    ),
  )
}
