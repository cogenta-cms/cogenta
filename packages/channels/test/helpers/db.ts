import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureChannelTables } from '../../src/linking/tables.js'
import { ensurePreferenceTables } from '../../src/preferences/tables.js'

/** A real, in-memory SQLite database — not a mock (AGENTS.md: "no database mock"). */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureChannelTables(db)
  await ensurePreferenceTables(db)
  return db
}
