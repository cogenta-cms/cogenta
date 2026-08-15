import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureFleetTables } from '../../src/enrollment/tables.js'

/** A real, in-memory SQLite database — not a mock (AGENTS.md: "no database mock"). */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureFleetTables(db)
  return db
}
