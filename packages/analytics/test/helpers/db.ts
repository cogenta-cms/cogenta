import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureAnalyticsTables } from '../../src/tables.js'

/**
 * A real, in-memory SQLite database — not a mock (AGENTS.md: "no database
 * mock"). SQLite is the degraded driver every dialect-agnostic query in this
 * package must also work against; the Postgres/MySQL equivalents run in
 * `test/integration`.
 */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureAnalyticsTables(db)
  return db
}
