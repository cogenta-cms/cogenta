import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureCommerceTables } from '../../src/tables.js'

/**
 * A real, in-memory SQLite database — not a mock. SQLite is the degraded
 * driver every dialect-agnostic query in this package must also work against
 * (AGENTS.md: "no database mock"; the Postgres/MySQL equivalents run the same
 * contract suites in test/integration).
 */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureCommerceTables(db)
  return db
}

export interface FileDb {
  readonly db: DatabaseHandle
  readonly path: string
  dispose(): Promise<void>
}

/**
 * A real SQLite **file**, and a second handle onto it.
 *
 * `:memory:` cannot be shared: two in-memory handles are two different
 * databases, so a concurrency test written against them proves nothing at all.
 * The oversell test needs two connections that genuinely contend for the same
 * rows, and only a file gives that.
 */
export async function testFileDb(): Promise<FileDb> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-commerce-'))
  const path = join(directory, 'shop.db')
  const db = await createSqliteHandle({ url: path })
  await ensureCommerceTables(db)

  return {
    db,
    path,
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
