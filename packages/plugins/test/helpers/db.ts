import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensurePluginTables } from '../../src/permissions/tables.js'

/** A real, in-memory SQLite database — not a mock (AGENTS.md: "no database mock"). */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensurePluginTables(db)
  return db
}
