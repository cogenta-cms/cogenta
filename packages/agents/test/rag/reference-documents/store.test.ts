import { createSqliteHandle } from '@cogenta/core'
import { runReferenceDocumentStoreContract } from './store.contract.js'

runReferenceDocumentStoreContract('sqlite', async () => {
  const db = await createSqliteHandle({ url: ':memory:' })
  return { db, dispose: () => db.close() }
})
