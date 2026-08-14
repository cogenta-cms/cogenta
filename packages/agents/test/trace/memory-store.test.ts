import { createMemoryTraceStore } from '../../src/trace/memory-store.js'
import { runTraceStoreContract } from './trace-store.contract.js'

runTraceStoreContract('memory', async () => ({
  createStore: async () => createMemoryTraceStore(),
}))
