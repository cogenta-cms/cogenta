import { runFormsContract } from './forms.contract.js'
import { testDb } from './helpers/db.js'

runFormsContract('sqlite', async () => ({ db: await testDb() }))
