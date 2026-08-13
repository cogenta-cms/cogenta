import { describe, it } from 'vitest'
import { createMysqlHandle, createPostgresHandle } from '../../src/db/index.js'
import { runMigratorContract } from '../migrations/migrator.contract.js'

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

// The engine has to behave the same on a database with transactional DDL and on
// one without. MySQL commits DDL implicitly, so a failed migration cannot be
// rolled back there — the suite asserts that the engine says so rather than
// claiming a rollback that did not happen.
if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('Migrator on Postgres', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMigratorContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 2 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  describe.skip('Migrator on MySQL', () => {
    it('skipped: COGENTA_TEST_MYSQL_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMigratorContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 2 }),
  }))
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  describe.skip('Migrator on MariaDB', () => {
    it('skipped: COGENTA_TEST_MARIADB_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMigratorContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 2 }),
  }))
}
