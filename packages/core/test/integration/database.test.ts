import { describe, expect, it } from 'vitest'
import {
  createDatabaseRegistry,
  createMysqlHandle,
  createPostgresHandle,
  createSqliteHandle,
  type DatabaseHandle,
  sql,
  unsafeRaw,
} from '../../src/db/index.js'
import { createLogger } from '../../src/logger/index.js'
import { runDatabaseContract } from '../db/database.contract.js'

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const silent = createLogger({ level: 'silent' })

/**
 * The L0 exit criterion, made executable: **the three databases pass the same
 * integration suite**. Not three suites that resemble each other — this exact
 * file, the one SQLite already runs as a unit test.
 */
if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('Postgres', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runDatabaseContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  describe.skip('MySQL', () => {
    it('skipped: COGENTA_TEST_MYSQL_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runDatabaseContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

// MariaDB is exercised separately from MySQL on purpose: it has RETURNING and a
// native VECTOR type that MySQL Community does not, so "MySQL-compatible" is not
// a claim the project can make without checking.
if (mariadbUrl === undefined || mariadbUrl === '') {
  describe.skip('MariaDB', () => {
    it('skipped: COGENTA_TEST_MARIADB_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runDatabaseContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}

describe.skipIf(postgresUrl === undefined || postgresUrl === '')('postgres driver', () => {
  const url = postgresUrl as string

  it('is available when the server answers, at the optimal tier', async () => {
    const { postgresDatabaseDriver } = await import('../../src/db/index.js')
    const driver = postgresDatabaseDriver()

    expect(await driver.available({ url })).toBe(true)
    expect(driver.tier).toBe('optimal')
  })

  it('is unavailable when nothing is listening, so the registry falls through', async () => {
    const { postgresDatabaseDriver } = await import('../../src/db/index.js')

    expect(await postgresDatabaseDriver().available({ url: 'postgres://u@127.0.0.1:1/none' })).toBe(
      false,
    )
  })

  it('is unavailable for a URL that belongs to another dialect', async () => {
    const { postgresDatabaseDriver } = await import('../../src/db/index.js')

    expect(await postgresDatabaseDriver().available({ url: 'mysql://u@127.0.0.1:3306/x' })).toBe(
      false,
    )
  })

  it('is chosen over SQLite when it is reachable', async () => {
    const selection = await createDatabaseRegistry({ logger: silent }).select({ url })

    expect(selection.driver).toBe('postgres')
    expect(selection.tier).toBe('optimal')
    await selection.dispose()
  })

  it('reports health without ever echoing the connection URL', async () => {
    const selection = await createDatabaseRegistry({ logger: silent }).select({ url })
    const report = await selection.health()

    expect(report).toMatchObject({ status: 'ok', driver: 'postgres' })
    expect(JSON.stringify(report)).not.toContain('postgres://')
    await selection.dispose()
  })

  it('keeps a transaction on one connection even under concurrency', async () => {
    // The bug this guards against: BEGIN on a pool starts the transaction on
    // whichever connection is free, and the rest of the statements run outside
    // it. Ten concurrent transactions on a pool of three would expose it.
    const db = await createPostgresHandle({ url, poolSize: 3 })
    await db.query(sql`drop table if exists tx_isolation`)
    await db.query(sql`create table tx_isolation (n integer)`)

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db
          .transaction(async (tx) => {
            await tx.query(sql`insert into tx_isolation (n) values (${i})`)
            if (i % 2 === 0) throw new Error('rollback this one')
          })
          .catch(() => undefined),
      ),
    )

    const result = await db.query<{ n: number }>(sql`select n from tx_isolation order by n`)
    expect(result.rows.map((row) => row.n)).toEqual([1, 3, 5, 7, 9])

    await db.query(sql`drop table tx_isolation`)
    await db.close()
  })
})

describe.skipIf(mysqlUrl === undefined || mysqlUrl === '')('mysql driver', () => {
  const url = mysqlUrl as string

  it('is available when the server answers, at the optimal tier', async () => {
    const { mysqlDatabaseDriver } = await import('../../src/db/index.js')

    expect(await mysqlDatabaseDriver().available({ url })).toBe(true)
  })

  it('is unavailable when nothing is listening', async () => {
    const { mysqlDatabaseDriver } = await import('../../src/db/index.js')

    expect(await mysqlDatabaseDriver().available({ url: 'mysql://u@127.0.0.1:1/none' })).toBe(false)
  })

  it('names the server version, since MariaDB and MySQL are not interchangeable', async () => {
    const selection = await createDatabaseRegistry({ logger: silent }).select({ url })
    const report = await selection.health()

    expect(report.message).toMatch(/Connected to \d/)
    expect(JSON.stringify(report)).not.toContain('mysql://')
    await selection.dispose()
  })

  it('keeps a transaction on one connection even under concurrency', async () => {
    const db = await createMysqlHandle({ url, poolSize: 3 })
    await db.query(sql`drop table if exists tx_isolation`)
    await db.query(sql`create table tx_isolation (n integer)`)

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db
          .transaction(async (tx) => {
            await tx.query(sql`insert into tx_isolation (n) values (${i})`)
            if (i % 2 === 0) throw new Error('rollback this one')
          })
          .catch(() => undefined),
      ),
    )

    const result = await db.query<{ n: number }>(sql`select n from tx_isolation order by n`)
    expect(result.rows.map((row) => Number(row.n))).toEqual([1, 3, 5, 7, 9])

    await db.query(sql`drop table tx_isolation`)
    await db.close()
  })
})

describe('the three dialects agree', () => {
  it('stores and reads a boolean identically wherever it runs', async () => {
    // Booleans are the sharpest example of a dialect difference a caller must
    // never see: Postgres has a real type, MySQL stores tinyint(1), and SQLite
    // has nothing at all. One assertion, run against whatever is reachable.
    const handles: DatabaseHandle[] = [await createSqliteHandle({ url: ':memory:' })]

    if (postgresUrl !== undefined && postgresUrl !== '') {
      handles.push(await createPostgresHandle({ url: postgresUrl, poolSize: 1 }))
    }
    if (mysqlUrl !== undefined && mysqlUrl !== '') {
      handles.push(await createMysqlHandle({ url: mysqlUrl, poolSize: 1 }))
    }

    for (const db of handles) {
      const booleanType = unsafeRaw(db.dialect === 'postgres' ? 'boolean' : 'tinyint')

      await db.query(sql`drop table if exists parity_check`)
      await db.query(sql`create table parity_check (flag ${booleanType} not null)`)
      await db.query(sql`insert into parity_check (flag) values (${true})`)

      const matched = await db.query(sql`select flag from parity_check where flag = ${true}`)
      expect(matched.rows, `dialect ${db.dialect}`).toHaveLength(1)

      const missed = await db.query(sql`select flag from parity_check where flag = ${false}`)
      expect(missed.rows, `dialect ${db.dialect}`).toHaveLength(0)

      await db.query(sql`drop table parity_check`)
      await db.close()
    }
  })
})
