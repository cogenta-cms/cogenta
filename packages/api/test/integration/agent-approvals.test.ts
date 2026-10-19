import process from 'node:process'
import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runAgentApprovalsContract } from '../rest/agent-approvals.contract.js'

for (const [label, variable, connect] of [
  ['postgres', 'COGENTA_TEST_POSTGRES_URL', createPostgresHandle],
  ['mysql', 'COGENTA_TEST_MYSQL_URL', createMysqlHandle],
  ['mariadb', 'COGENTA_TEST_MARIADB_URL', createMysqlHandle],
] as const) {
  const url = process.env[variable]
  if (url === undefined || url === '') {
    describe.skip(`human decisions — ${label}`, () => {
      it(`skipped: ${variable} is not set`, () => undefined)
    })
  } else runAgentApprovalsContract(label, () => connect({ url, poolSize: 3 }))
}
