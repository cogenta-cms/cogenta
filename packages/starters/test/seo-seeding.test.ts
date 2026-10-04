import { createSqliteHandle } from '@cogenta/core'
import { runSeoSeedingContract } from './seo-seeding.contract.js'

runSeoSeedingContract('sqlite', () => createSqliteHandle({ url: ':memory:' }))
