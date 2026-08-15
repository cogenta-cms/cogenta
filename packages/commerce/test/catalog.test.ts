import { createSqliteHandle } from '@cogenta/core'
import { runCatalogContract } from './catalog.contract.js'

runCatalogContract('sqlite', async () => ({
  db: await createSqliteHandle({ url: ':memory:' }),
}))
