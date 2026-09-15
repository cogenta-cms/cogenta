import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runWidgetStoreContract } from '../store.contract.js'

/**
 * The widget-store contract against the real servers. A missing service is
 * skipped loudly, naming the variable, never a silent green tick.
 */

const servers = [
  ['postgres', 'COGENTA_TEST_POSTGRES_URL', createPostgresHandle],
  ['mysql', 'COGENTA_TEST_MYSQL_URL', createMysqlHandle],
  ['mariadb', 'COGENTA_TEST_MARIADB_URL', createMysqlHandle],
] as const

for (const [label, variable, connect] of servers) {
  const url = process.env[variable]
  if (url === undefined || url === '') {
    describe.skip(`Widget store contract — ${label}`, () => {
      it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
    })
  } else {
    runWidgetStoreContract(label, async () => ({ db: await connect({ url, poolSize: 3 }) }))
  }
}
