import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runTaxonomyContract } from './taxonomy-store.contract.js'

/**
 * SQLite runs the taxonomy contract as a plain unit test, for the same reason
 * the content store does: it is the degraded driver every shared-hosting
 * install falls back to, so it must never be the untested one.
 */
runTaxonomyContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-taxonomy-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'taxonomy.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
