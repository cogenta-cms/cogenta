import process from 'node:process'
import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runWordPressPreflightContract } from '../wordpress/target-preflight.contract.js'

for (const [label, variable, connect] of [
  ['postgres', 'COGENTA_TEST_POSTGRES_URL', createPostgresHandle],
  ['mysql', 'COGENTA_TEST_MYSQL_URL', createMysqlHandle],
  ['mariadb', 'COGENTA_TEST_MARIADB_URL', createMysqlHandle],
] as const) {
  const url = process.env[variable]
  if (url === undefined || url === '') {
    describe.skip(`WordPress target preflight — ${label}`, () => {
      it(`skipped: ${variable} is not set`, () => undefined)
    })
  } else runWordPressPreflightContract(label, () => connect({ url, poolSize: 3 }))
}
