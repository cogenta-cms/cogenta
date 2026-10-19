import process from 'node:process'
import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runPaymentWebhookContract } from '../payment-webhook.contract.js'

// Real SQL databases plus the local provider protocol fixture; no provider
// credentials or claims of a real Stripe sandbox transaction are involved.
for (const [label, variable, connect] of [
  ['postgres', 'COGENTA_TEST_POSTGRES_URL', createPostgresHandle],
  ['mysql', 'COGENTA_TEST_MYSQL_URL', createMysqlHandle],
  ['mariadb', 'COGENTA_TEST_MARIADB_URL', createMysqlHandle],
] as const) {
  const url = process.env[variable]
  if (url === undefined || url === '') {
    describe.skip(`payment webhook contract — ${label}`, () => {
      it(`skipped: ${variable} is not set`, () => undefined)
    })
  } else {
    runPaymentWebhookContract(label, () => connect({ url, poolSize: 3 }))
  }
}
