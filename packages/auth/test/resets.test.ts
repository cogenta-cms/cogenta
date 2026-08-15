import { createSqliteHandle } from '@cogenta/core'
import { runPasswordResetContract } from './resets.contract.js'

/**
 * SQLite runs the contract as a plain unit test — no service, nothing to
 * start — and it is the driver every install falls back to, so it is the one
 * that must never be the untested one. The same suite runs against the three
 * servers in `test/integration/resets.test.ts`.
 */
runPasswordResetContract('sqlite', async () => ({
  db: await createSqliteHandle({ url: ':memory:' }),
}))
