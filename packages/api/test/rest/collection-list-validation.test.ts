import { createSqliteHandle } from '@cogenta/core'
import { runCollectionListValidationContract } from './collection-list-validation.contract.js'

runCollectionListValidationContract('sqlite', () => createSqliteHandle({ url: ':memory:' }))
