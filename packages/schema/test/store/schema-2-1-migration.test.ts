import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runSchema21MigrationContract } from './schema-2-1-migration.contract.js'

/**
 * SQLite first: `alter table add column ... not null default ...` is the
 * dialect most likely to reject a shape the other two accept without
 * complaint.
 */
runSchema21MigrationContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-migration-21-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'migration.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
