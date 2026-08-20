import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureFormsTables } from '../../src/tables.js'

/** A real, in-memory SQLite database — not a mock (AGENTS.md). */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureFormsTables(db)
  return db
}
