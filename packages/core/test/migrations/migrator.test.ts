import { createSqliteHandle } from '../../src/db/index.js'
import { runMigratorContract } from './migrator.contract.js'

// SQLite needs no service, so the engine is exercised on every machine.
// Postgres, MySQL and MariaDB run the same file in test/integration.
runMigratorContract('sqlite', async () => ({
  db: await createSqliteHandle({ url: ':memory:' }),
}))
