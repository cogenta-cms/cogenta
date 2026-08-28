import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  createMysqlHandle,
  createPostgresHandle,
  type DatabaseHandle,
  identifier,
  sql,
} from '../../src/db/index.js'
import {
  createDatabaseMediaFolderStore,
  createDatabaseMediaStore,
  MEDIA_FOLDER_TABLE,
} from '../../src/media/index.js'
import { runMediaFolderContract } from '../media/folder-store.contract.js'

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

/**
 * The one race SQLite cannot demonstrate — `{ immediate: true }` only takes
 * a real write lock there (`BEGIN IMMEDIATE`), serialising two connections
 * to the same file so the race never actually happens. Postgres and
 * MySQL/MariaDB both discard that option and run under their own default
 * isolation, so this is the same "two real concurrent connections, one
 * never-before-seen row" test `@cogenta/schema`'s `routing.test.ts` already
 * proved for `NotFoundLogStore.record()`'s upsert — same shape of fix here
 * (`ensureRoot`'s deterministic id + `on conflict`/`on duplicate key`).
 * Before that fix, two replicas of `cogenta serve` starting at once could
 * each insert their own `contents` root folder.
 */
interface ConcurrencyDialect {
  readonly label: string
  readonly connect: () => Promise<DatabaseHandle>
}

function missingConcurrency(label: string, variable: string): void {
  describe.skip(`MediaFolderStore.ensureRoot concurrency — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

function runEnsureRootConcurrency(dialect: ConcurrencyDialect): void {
  describe(`MediaFolderStore.ensureRoot concurrency — ${dialect.label}`, () => {
    it('never creates two "contents" root folders under two real concurrent connections', async () => {
      const db = await dialect.connect()
      const second = await dialect.connect()
      try {
        await db.query(sql`drop table if exists ${identifier(MEDIA_FOLDER_TABLE, db.dialect)}`)
        const storeA = createDatabaseMediaFolderStore({ db })
        const storeB = createDatabaseMediaFolderStore({ db: second })

        const [a, b] = await Promise.all([
          storeA.ensureRoot('contents'),
          storeB.ensureRoot('contents'),
        ])
        expect(a.id).toBe(b.id)

        const roots = await storeA.list({ parentId: null })
        expect(roots.filter((folder) => folder.name === 'contents')).toHaveLength(1)
      } finally {
        await second.close()
        await db.close()
      }
    })
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('MediaFolderStore on Postgres', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMediaFolderContract('postgres', async () => {
    const db = await createPostgresHandle({ url: postgresUrl, poolSize: 2 })
    await db.query(sql`drop table if exists ${identifier('cogenta_media_folders', db.dialect)}`)
    await db.query(sql`drop table if exists ${identifier('cogenta_media', db.dialect)}`)
    return {
      createFolderStore: () => Promise.resolve(createDatabaseMediaFolderStore({ db })),
      createMediaStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
      dispose: () => db.close(),
    }
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  describe.skip('MediaFolderStore on MySQL', () => {
    it('skipped: COGENTA_TEST_MYSQL_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMediaFolderContract('mysql', async () => {
    const db = await createMysqlHandle({ url: mysqlUrl, poolSize: 2 })
    await db.query(sql`drop table if exists ${identifier('cogenta_media_folders', db.dialect)}`)
    await db.query(sql`drop table if exists ${identifier('cogenta_media', db.dialect)}`)
    return {
      createFolderStore: () => Promise.resolve(createDatabaseMediaFolderStore({ db })),
      createMediaStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
      dispose: () => db.close(),
    }
  })
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  describe.skip('MediaFolderStore on MariaDB', () => {
    it('skipped: COGENTA_TEST_MARIADB_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runMediaFolderContract('mariadb', async () => {
    const db = await createMysqlHandle({ url: mariadbUrl, poolSize: 2 })
    await db.query(sql`drop table if exists ${identifier('cogenta_media_folders', db.dialect)}`)
    await db.query(sql`drop table if exists ${identifier('cogenta_media', db.dialect)}`)
    return {
      createFolderStore: () => Promise.resolve(createDatabaseMediaFolderStore({ db })),
      createMediaStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
      dispose: () => db.close(),
    }
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missingConcurrency('Postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runEnsureRootConcurrency({
    label: 'postgres',
    connect: () => createPostgresHandle({ url: postgresUrl, poolSize: 2 }),
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missingConcurrency('MySQL', 'COGENTA_TEST_MYSQL_URL')
} else {
  runEnsureRootConcurrency({
    label: 'mysql',
    connect: () => createMysqlHandle({ url: mysqlUrl, poolSize: 2 }),
  })
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missingConcurrency('MariaDB', 'COGENTA_TEST_MARIADB_URL')
} else {
  runEnsureRootConcurrency({
    label: 'mariadb',
    connect: () => createMysqlHandle({ url: mariadbUrl, poolSize: 2 }),
  })
}
