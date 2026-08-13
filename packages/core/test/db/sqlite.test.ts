import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDatabaseRegistry, createSqliteHandle, sql } from '../../src/db/index.js'
import { createLogger } from '../../src/logger/index.js'
import { runDatabaseContract } from './database.contract.js'

// SQLite needs no service at all, so it runs the contract as a unit test on
// every machine. Postgres and MySQL run the same file in test/integration.
runDatabaseContract('sqlite (memory)', async () => ({
  db: await createSqliteHandle({ url: ':memory:' }),
}))

const silent = createLogger({ level: 'silent' })

describe('sqlite driver', () => {
  it('creates the parent directory rather than failing on a fresh install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-db-'))
    const db = await createSqliteHandle({ url: join(root, 'nested', 'deeper', 'site.db') })

    await db.query(sql`create table t (a integer)`)
    await db.close()
    await rm(root, { recursive: true, force: true })
  })

  it('keeps data across reopening the file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-db-'))
    const url = join(root, 'site.db')

    const first = await createSqliteHandle({ url })
    await first.query(sql`create table t (a integer)`)
    await first.query(sql`insert into t (a) values (${1})`)
    await first.close()

    const second = await createSqliteHandle({ url })
    expect((await second.query(sql`select a from t`)).rows).toEqual([{ a: 1 }])
    await second.close()

    await rm(root, { recursive: true, force: true })
  })

  it('runs in WAL mode, without which concurrent writes block each other', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-db-'))
    const db = await createSqliteHandle({ url: join(root, 'site.db') })

    const result = await db.query<{ journal_mode: string }>(sql`pragma journal_mode`)
    expect(result.rows[0]?.journal_mode).toBe('wal')

    await db.close()
    await rm(root, { recursive: true, force: true })
  })

  it('enforces foreign keys, which SQLite leaves off by default', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await db.query(sql`create table parent (id integer primary key)`)
    await db.query(
      sql`create table child (id integer primary key, parent_id integer references parent(id))`,
    )

    await expect(
      db.query(sql`insert into child (id, parent_id) values (${1}, ${999})`),
    ).rejects.toThrowError()

    await db.close()
  })

  it('accepts every URL form a user might write for the same file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-db-'))
    const path = join(root, 'site.db')

    const seeded = await createSqliteHandle({ url: path })
    await seeded.query(sql`create table t (a integer)`)
    await seeded.query(sql`insert into t (a) values (${1})`)
    await seeded.close()

    // A bare path, a file: URL and a sqlite:// URL must all open that one file.
    for (const url of [path, `file:${path}`, `sqlite://${path}`]) {
      const db = await createSqliteHandle({ url })
      expect((await db.query(sql`select a from t`)).rows).toEqual([{ a: 1 }])
      await db.close()
    }

    await rm(root, { recursive: true, force: true })
  })

  it('opens an in-memory database that keeps nothing', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    expect((await db.query(sql`select 1 as one`)).rows).toEqual([{ one: 1 }])
    await db.close()
  })

  it('reports rows affected for a delete as well as an update', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await db.query(sql`create table t (a integer)`)
    await db.query(sql`insert into t (a) values (${1})`)
    await db.query(sql`insert into t (a) values (${2})`)

    expect((await db.query(sql`delete from t`)).rowsAffected).toBe(2)
    await db.close()
  })

  it('returns rows for an insert with RETURNING', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await db.query(sql`create table t (a integer)`)

    const result = await db.query<{ a: number }>(sql`insert into t (a) values (${7}) returning a`)
    expect(result.rows).toEqual([{ a: 7 }])
    await db.close()
  })
})

describe('database registry', () => {
  it('selects SQLite when nothing else is installed', async () => {
    const selection = await createDatabaseRegistry({ logger: silent }).select({ url: ':memory:' })

    expect(selection.driver).toBe('sqlite')
    await selection.dispose()
  })

  it('says what SQLite costs in its health report', async () => {
    const selection = await createDatabaseRegistry({ logger: silent }).select({ url: ':memory:' })

    expect((await selection.health()).message).toContain('Single machine')
    await selection.dispose()
  })
})
