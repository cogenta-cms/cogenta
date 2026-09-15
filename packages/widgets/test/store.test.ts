import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runWidgetStoreContract } from './store.contract.js'

runWidgetStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-widgets-'))
  return {
    db: await createSqliteHandle({ url: join(directory, 'widgets.db') }),
    cleanup: () => rm(directory, { recursive: true, force: true, maxRetries: 5 }),
  }
})
