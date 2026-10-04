import { createSqliteHandle } from '@cogenta/core'
import { runWordPressPreflightContract } from './target-preflight.contract.js'

runWordPressPreflightContract('sqlite', () => createSqliteHandle({ url: ':memory:' }))
