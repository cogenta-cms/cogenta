import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileTraceStore } from '../../src/trace/file-store.js'
import { runTraceStoreContract } from './trace-store.contract.js'

runTraceStoreContract('file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cogenta-trace-'))
  return {
    createStore: async () => createFileTraceStore({ dir }),
    dispose: async () => {
      await rm(dir, { recursive: true, force: true })
    },
  }
})
