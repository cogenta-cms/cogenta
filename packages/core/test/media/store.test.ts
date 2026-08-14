import { createSqliteHandle } from '../../src/db/index.js'
import { createDatabaseMediaStore } from '../../src/media/index.js'
import { runMediaContract } from './store.contract.js'

runMediaContract('sqlite', async () => {
  const db = await createSqliteHandle({ url: ':memory:' })
  return {
    createStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
    dispose: () => db.close(),
  }
})
