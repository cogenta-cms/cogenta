import process from 'node:process'
import { describe, it } from 'vitest'
import { createMysqlHandle, createPostgresHandle, identifier, sql } from '../../src/db/index.js'
import { createDatabaseMediaStore } from '../../src/media/index.js'
import { runMediaContract } from '../media/store.contract.js'

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('MediaStore on Postgres', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMediaContract('postgres', async () => {
    const db = await createPostgresHandle({ url: postgresUrl, poolSize: 2 })
    await db.query(sql`drop table if exists ${identifier('cogenta_media', db.dialect)}`)
    return {
      createStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
      dispose: () => db.close(),
    }
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  describe.skip('MediaStore on MySQL', () => {
    it('skipped: COGENTA_TEST_MYSQL_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMediaContract('mysql', async () => {
    const db = await createMysqlHandle({ url: mysqlUrl, poolSize: 2 })
    await db.query(sql`drop table if exists ${identifier('cogenta_media', db.dialect)}`)
    return {
      createStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
      dispose: () => db.close(),
    }
  })
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  describe.skip('MediaStore on MariaDB', () => {
    it('skipped: COGENTA_TEST_MARIADB_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMediaContract('mariadb', async () => {
    const db = await createMysqlHandle({ url: mariadbUrl, poolSize: 2 })
    await db.query(sql`drop table if exists ${identifier('cogenta_media', db.dialect)}`)
    return {
      createStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
      dispose: () => db.close(),
    }
  })
}
