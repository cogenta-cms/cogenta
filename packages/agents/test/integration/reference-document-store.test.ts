import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runReferenceDocumentStoreContract } from '../rag/reference-documents/store.contract.js'

/**
 * The same `ReferenceDocumentStore` contract suite as the SQLite unit test
 * (`test/rag/reference-documents/store.test.ts`), against the real servers —
 * L22 task 4's own table, dialect-typed by hand (see that store's module
 * comment for why it does not import `@cogenta/schema`'s column helpers).
 *
 * A missing service is skipped **loudly**: a `describe.skip` naming the
 * variable that was unset, never a silent pass — the same convention every
 * other integration suite in this monorepo uses.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`ReferenceDocumentStore contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runReferenceDocumentStoreContract('postgres', async () => {
    const db = await createPostgresHandle({ url: postgresUrl, poolSize: 3 })
    return { db, dispose: () => db.close() }
  })
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runReferenceDocumentStoreContract('mysql', async () => {
    const db = await createMysqlHandle({ url: mysqlUrl, poolSize: 3 })
    return { db, dispose: () => db.close() }
  })
}

// MariaDB run separately from MySQL, like every other dialect suite here —
// "MySQL-compatible" is not a claim this project makes untested.
if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runReferenceDocumentStoreContract('mariadb', async () => {
    const db = await createMysqlHandle({ url: mariadbUrl, poolSize: 3 })
    return { db, dispose: () => db.close() }
  })
}
