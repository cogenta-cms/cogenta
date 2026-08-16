import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runSchema2MigrationContract } from './schema-2-migration.contract.js'

/**
 * SQLite first, and not only because it needs no service: it is the dialect
 * where `alter table drop column` is youngest (3.35, 2021) and refuses a
 * column an index still covers. If the rollback works here it is not by
 * accident.
 */
runSchema2MigrationContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-migration-'))

  return {
    db: await createSqliteHandle({ url: join(directory, 'migration.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
