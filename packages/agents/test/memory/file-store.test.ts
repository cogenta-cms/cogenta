import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileMemoryStore } from '../../src/memory/file-store.js'
import { runMemoryStoreContract } from './memory-store.contract.js'

runMemoryStoreContract('file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cogenta-memory-'))
  return {
    createStore: async () => createFileMemoryStore({ dir }),
    dispose: async () => {
      await rm(dir, { recursive: true, force: true })
    },
  }
})
