import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runContentStoreContract } from './content-store.contract.js'

/**
 * SQLite runs the contract as a plain unit test: no service, no Docker, nothing
 * to start. That is deliberate — SQLite is the degraded driver every install
 * falls back to, so it is the one that must never be the untested one.
 *
 * A file rather than `:memory:`: the store opens transactions and foreign keys,
 * and a file is what a real shared-hosting install actually runs on.
 */
runContentStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-store-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'store.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
