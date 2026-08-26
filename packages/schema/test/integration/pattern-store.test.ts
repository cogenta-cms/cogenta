import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runPatternStoreContract } from '../store/pattern-store.contract.js'

/**
 * The same pattern-store contract as the SQLite unit test, against the real
 * servers (fiche 43 sub-chantier A).
 *
 * `cogenta_patterns` uses the same portable-column helpers
 * (`identifier`/`textColumn`/`jsonColumn`) every other real table in this
 * package does, but that is a design intention until it has actually run
 * against all three — the same reasoning `taxonomy-store`'s own integration
 * suite states for its materialised path.
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the
 * variable, so a run that could not reach Postgres says so instead of showing
 * a green tick that means nothing.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`Pattern store contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runPatternStoreContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runPatternStoreContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

// MariaDB separately from MySQL, as everywhere else in this repository: they
// differ on RETURNING and on types, so "MySQL-compatible" is never an
// untested claim here.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runPatternStoreContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
