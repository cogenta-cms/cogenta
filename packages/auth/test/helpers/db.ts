import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

export interface FileDb {
  readonly db: DatabaseHandle
  readonly path: string
  dispose(): Promise<void>
}

/**
 * A real SQLite **file**, plus its path so a second, independent handle can
 * open the same database. `:memory:` cannot be shared — two in-memory
 * handles are two unrelated databases, so a concurrency test against them
 * would prove nothing about a real race (`packages/commerce/test/helpers/
 * db.ts`'s `testFileDb`, same reasoning, reused here for the recovery-code
 * single-use guarantee).
 */
export async function testFileDb(): Promise<FileDb> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-auth-'))
  const path = join(directory, 'auth.db')
  const db = await createSqliteHandle({ url: path })
  await ensureAuthTables(db)

  return {
    db,
    path,
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
