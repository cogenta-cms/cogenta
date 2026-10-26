import { createSqliteHandle } from '@cogenta/core'
import { runTotpStorageContract } from './totp-storage.contract.js'

/**
 * SQLite is the driver every install falls back to, so it is the one that must
 * never be the untested one. The same suite runs against the three servers in
 * `test/integration/totp-storage.test.ts`.
 */
runTotpStorageContract('sqlite', async () => ({
  db: await createSqliteHandle({ url: ':memory:' }),
}))
