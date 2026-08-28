import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runSearchConsoleStoreContract } from './search-console-store.contract.js'

/**
 * SQLite runs the Search Console connection store contract as a plain unit
 * test, for the same reason every other real data store in this package
 * does: it is the degraded driver every shared-hosting install falls back
 * to, so it must never be the untested one.
 */
runSearchConsoleStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-search-console-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'search-console.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
