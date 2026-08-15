import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureControlTables } from '../../src/control/tables.js'
import { ensureFleetTables } from '../../src/enrollment/tables.js'
import { ensureReportingTables } from '../../src/reporting/tables.js'
import { ensureRolloutTables } from '../../src/rollout/tables.js'

/** A real, in-memory SQLite database — not a mock (AGENTS.md: "no database mock"). */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureFleetTables(db)
  await ensureControlTables(db)
  await ensureRolloutTables(db)
  await ensureReportingTables(db)
  return db
}
