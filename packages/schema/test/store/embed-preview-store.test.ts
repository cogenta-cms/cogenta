import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { runEmbedPreviewStoreContract } from './embed-preview-store.contract.js'

/** SQLite runs the embed preview cache contract as a unit test: it is the driver a shared host falls back to. */
runEmbedPreviewStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-embed-preview-'))
  return {
    db: await createSqliteHandle({ url: join(directory, 'embeds.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})
