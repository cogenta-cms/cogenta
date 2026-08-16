import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runTaxonomyContract } from '../store/taxonomy-store.contract.js'

/**
 * The same taxonomy contract as the SQLite unit test, against the real
 * servers.
 *
 * This one carries more weight than most: the materialised path was chosen
 * over a recursive CTE precisely because `like` on a path behaves identically
 * on the three dialects (ADR-0006, ADR-0022). Until this file has actually run
 * against all three, that is a design intention, not a verified fact.
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the
 * variable, so a run that could not reach Postgres says so instead of showing
 * a green tick that means nothing.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`Taxonomy contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runTaxonomyContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runTaxonomyContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

// MariaDB separately from MySQL, as everywhere else in this repository: they
// differ on RETURNING and on types, so "MySQL-compatible" is never an
// untested claim here.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runTaxonomyContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
