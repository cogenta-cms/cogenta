import { createSqliteHandle } from '@cogenta/core'
import { runCheckoutContract } from './checkout.contract.js'

runCheckoutContract('sqlite', async () => ({
  db: await createSqliteHandle({ url: ':memory:' }),
}))
