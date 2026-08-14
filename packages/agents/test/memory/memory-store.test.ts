import { createMemoryStore } from '../../src/memory/memory-store.js'
import { runMemoryStoreContract } from './memory-store.contract.js'

runMemoryStoreContract('memory', async () => ({ createStore: async () => createMemoryStore() }))
