import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runPatternStoreContract } from './pattern-store.contract.js'

/**
 * SQLite runs the pattern store contract as a plain unit test, for the same
 * reason the content and taxonomy stores do: it is the degraded driver every
 * shared-hosting install falls back to, so it must never be the untested one.
 */
runPatternStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-pattern-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'pattern.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
