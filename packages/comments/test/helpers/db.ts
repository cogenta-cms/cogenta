import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { ensureCommentsTables } from '../../src/tables.js'

/** A real, in-memory SQLite database — not a mock (AGENTS.md). */
export async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureCommentsTables(db)
  return db
}

export interface FileDb {
  readonly db: DatabaseHandle
  readonly path: string
  dispose(): Promise<void>
}

/** A real SQLite file — `:memory:` cannot be shared across two handles, which the rate-limit concurrency test needs. */
export async function testFileDb(): Promise<FileDb> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-comments-'))
  const path = join(directory, 'comments.db')
  const db = await createSqliteHandle({ url: path })
  await ensureCommentsTables(db)

  return {
    db,
    path,
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
