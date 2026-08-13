import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureAuthTables } from '../../src/tables.js'

/**
 * A real, in-memory SQLite database — not a mock. SQLite is the degraded
 * driver every dialect-agnostic query in this package must also work against
 * (AGENTS.md: "no database mock"; the postgres/mysql equivalents run the same
 * store contracts in test/integration).
 */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
  return db
}
