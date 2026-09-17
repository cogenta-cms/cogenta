import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runEmbedPreviewStoreContract } from '../store/embed-preview-store.contract.js'

/**
 * The embed preview cache contract (L38) against the real servers. A missing
 * service is skipped loudly, naming the variable to set.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`Embed preview store contract — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  runEmbedPreviewStoreContract('postgres', async () => ({
    db: await createPostgresHandle({ url: postgresUrl, poolSize: 3 }),
  }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  runEmbedPreviewStoreContract('mysql', async () => ({
    db: await createMysqlHandle({ url: mysqlUrl, poolSize: 3 }),
  }))
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  runEmbedPreviewStoreContract('mariadb', async () => ({
    db: await createMysqlHandle({ url: mariadbUrl, poolSize: 3 }),
  }))
}
