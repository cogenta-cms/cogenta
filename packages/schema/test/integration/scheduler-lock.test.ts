import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runSchedulerLockContract } from '../store/scheduler-lock.contract.js'

/**
 * The scheduler claim contract (L22 task 6) against the real servers.
 *
 * SQLite is covered as a real unit test in
 * `test/scheduling/registry-lock.test.ts` (a real file, two connections, plus
 * the naive-unlocked counter-test proving the bug this replaces). This file
 * proves the same guard on the two dialects SQLite does not exercise: a
 * single-row `UPDATE ... WHERE` behaves identically there, but "should" is
 * not "does" until it is run for real.
 *
 * A missing service is skipped **loudly**, naming the variable that was
 * unset, so a run that never reached Postgres reports a skipped suite rather
 * than a green tick that proves nothing — same convention as
 * `search-indexing.test.ts`.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`scheduled-task claim — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runSchedulerLockContract('postgres', async () => {
    const a = await createPostgresHandle({ url: postgresUrl, poolSize: 2 })
    const b = await createPostgresHandle({ url: postgresUrl, poolSize: 2 })
    return {
      a,
      b,
      dispose: async () => {
        await a.close()
        await b.close()
      },
    }
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runSchedulerLockContract('mysql', async () => {
    const a = await createMysqlHandle({ url: mysqlUrl, poolSize: 2 })
    const b = await createMysqlHandle({ url: mysqlUrl, poolSize: 2 })
    return {
      a,
      b,
      dispose: async () => {
        await a.close()
        await b.close()
      },
    }
  })
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runSchedulerLockContract('mariadb', async () => {
    const a = await createMysqlHandle({ url: mariadbUrl, poolSize: 2 })
    const b = await createMysqlHandle({ url: mariadbUrl, poolSize: 2 })
    return {
      a,
      b,
      dispose: async () => {
        await a.close()
        await b.close()
      },
    }
  })
}
