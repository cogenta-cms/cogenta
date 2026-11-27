import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runTermArchiveDisplayStoreContract } from './term-archive-display-store.contract.js'

/**
 * SQLite runs the term archive display store contract as a plain unit test, for the same
 * reason the content and taxonomy stores do: it is the degraded driver every
 * shared-hosting install falls back to, so it must never be the untested one.
 */
runTermArchiveDisplayStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-term-display-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'term-display.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
