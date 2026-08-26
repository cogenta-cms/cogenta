import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runRolePermissionConcurrencyContract } from '../store/role-permission-concurrency.contract.js'
import { runRolePermissionStoreContract } from '../store/role-permission-store.contract.js'

/**
 * The same role permission override contract as the SQLite unit test
 * (`role-permission-store.test.ts`'s own contract run), against the real
 * servers — fiche 63, ADR-0028.
 *
 * The `own` boolean column is the reason this matters more than a routine
 * table would: Postgres stores a real `boolean`, MySQL/MariaDB a `tinyint`,
 * and the write path binds the JS `boolean` through three different driver
 * layers. Until this file has actually run against all three, "it
 * round-trips" is a design intention, not a verified fact.
 *
 * The concurrency contract matters even more here than for the CRUD one:
 * `set()`'s delete-then-insert is exactly the shape
 * `test/integration/routing.test.ts` already found SQLite's `{ immediate:
 * true }` "masks... entirely" for `NotFoundLogStore`. Only two real,
 * independent connections to a real Postgres/MySQL/MariaDB server can prove
 * this store's own version of that race behaves — this is the open question
 * `BLOCKERS.md` names honestly rather than assumes answered by the SQLite
 * run alone.
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the
 * variable, so a run that could not reach Postgres says so instead of
 * showing a green tick that means nothing.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`role permission override contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
  describe.skip(`role permission override concurrency — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runRolePermissionStoreContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
  runRolePermissionConcurrencyContract('postgres', async () => {
    const a = await createPostgresHandle({ url: postgresUrl, poolSize: 3 })
    const b = await createPostgresHandle({ url: postgresUrl, poolSize: 3 })
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
  runRolePermissionStoreContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
  runRolePermissionConcurrencyContract('mysql', async () => {
    const a = await createMysqlHandle({ url: mysqlUrl, poolSize: 3 })
    const b = await createMysqlHandle({ url: mysqlUrl, poolSize: 3 })
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

// MariaDB separately from MySQL, as everywhere else in this repository: they
// differ on RETURNING and on types, so "MySQL-compatible" is never an
// untested claim here.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runRolePermissionStoreContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
  runRolePermissionConcurrencyContract('mariadb', async () => {
    const a = await createMysqlHandle({ url: mariadbUrl, poolSize: 3 })
    const b = await createMysqlHandle({ url: mariadbUrl, poolSize: 3 })
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
