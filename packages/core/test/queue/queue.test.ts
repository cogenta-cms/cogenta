import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '../../src/db/index.js'
import { databaseQueueHarness } from './database-harness.js'
import { runQueueContract } from './queue.contract.js'

// A file, not :memory:, because the concurrency test needs several connections
// to the same database — which an in-memory SQLite cannot provide.
runQueueContract(
  'sqlite',
  databaseQueueHarness(async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-queue-'))
    const url = join(root, 'queue.db')

    return {
      open: () => createSqliteHandle({ url }),
      dispose: () => rm(root, { recursive: true, force: true }),
    }
  }),
)
