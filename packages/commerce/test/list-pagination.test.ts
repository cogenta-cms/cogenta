import { testDb } from './helpers/db.js'
import { runListPaginationContract } from './list-pagination.contract.js'

runListPaginationContract('SQLite degraded driver', testDb)
