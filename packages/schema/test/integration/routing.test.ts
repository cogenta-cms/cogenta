import { createMysqlHandle, createPostgresHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotFoundLogStore } from '../../src/routing/not-found-log.js'
import { createRedirectPatternStore } from '../../src/routing/redirect-patterns.js'
import { createRedirectStore } from '../../src/routing/redirects.js'

/**
 * Fiche 12's three routing tables against the real servers.
 *
 * SQLite (`test/routing/{redirects,not-found-log,redirect-patterns}.test.ts`
 * and `test/store/redirect-tracking.test.ts`) already covers the full
 * behavioural contract. What only Postgres/MySQL/MariaDB can prove is the
 * dialect-specific SQL these three tables actually run: the `on conflict do
 * update` / `on duplicate key update` upsert `NotFoundLogStore.record()`
 * relies on to never crash under a concurrent 404 (SQLite's `{ immediate:
 * true }` masks that race entirely — see the doc comment on `record()`), and
 * the `varchar(512)` primary key / unique index both new tables carry, which
 * is exactly the width `db-dialect-specialist` flagged as needing real MySQL
 * verification (see `BLOCKERS.md`).
 *
 * A missing service is skipped **loudly**, naming the variable that was
 * unset, so a run that never reached Postgres reports a skipped suite rather
 * than a green tick that proves nothing.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

interface Dialect {
  readonly label: string
  readonly connect: () => Promise<DatabaseHandle>
}

function missing(label: string, variable: string): void {
  describe.skip(`routing tables — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

function runRoutingContract(dialect: Dialect): void {
  describe(`routing tables — ${dialect.label}`, () => {
    let db: DatabaseHandle

    afterEach(async () => {
      await db.close()
    })

    it('creates a 410 with no destination, edits a rule with update(), and keeps a chain flattened to one hop', async () => {
      db = await dialect.connect()
      const store = createRedirectStore({ db, table: `cogenta_redirects_it_${dialect.label}` })

      await store.add({ from: '/discontinued', status: 410 })
      await expect(store.resolve('/discontinued')).resolves.toEqual({
        to: '/discontinued',
        status: 410,
      })

      await store.add({ from: '/a', to: '/b' })
      await store.add({ from: '/b', to: '/c' })
      await expect(store.resolve('/a')).resolves.toEqual({ to: '/c', status: 301 })

      const updated = await store.update('/a', { to: '/d', status: 302 })
      expect(updated).toMatchObject({ from: '/a', to: '/d', status: 302 })
    })

    it('upserts the 404 log without ever throwing under two real concurrent connections racing the same brand-new path', async () => {
      db = await dialect.connect()
      const second = await dialect.connect()
      try {
        const table = `cogenta_not_found_it_${dialect.label}`
        const storeA = createNotFoundLogStore({ db, table })
        const storeB = createNotFoundLogStore({ db: second, table })

        // The exact race SQLite's `{ immediate: true }` cannot demonstrate:
        // two independent connections, two anonymous visitors, one
        // never-before-seen path. Before the upsert fix, the loser of this
        // race crashed on the `path` primary key on Postgres/MySQL.
        await Promise.all([
          storeA.record({ path: '/stampede' }),
          storeB.record({ path: '/stampede' }),
        ])

        const rows = await storeA.list()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ path: '/stampede', hits: 2 })
      } finally {
        await second.close()
      }
    })

    it('rewrites a prefix and refuses a second one past its cap check', async () => {
      db = await dialect.connect()
      const store = createRedirectPatternStore({
        db,
        table: `cogenta_redirect_patterns_it_${dialect.label}`,
      })

      await store.add({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' })
      await expect(store.resolve('/blog/post-1')).resolves.toEqual({
        to: '/actualites/post-1',
        status: 301,
      })

      const removed = await store.remove('/blog/*')
      expect(removed).toBe(true)
    })
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runRoutingContract({
    label: 'postgres',
    connect: () => createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runRoutingContract({
    label: 'mysql',
    connect: () => createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  })
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runRoutingContract({
    label: 'mariadb',
    connect: () => createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  })
}
