import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runSchema24MigrationContract } from './schema-2-4-migration.contract.js'

/**
 * SQLite first, and this time it is not only the strictest dialect — it is the
 * only one that cannot change a constraint at all, so it is the only one whose
 * repair moves rows. A file, never `:memory:`: the rebuild drops and recreates
 * a real table, and a journal that exists is part of what makes that safe.
 */
runSchema24MigrationContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-migration-24-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'migration.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
