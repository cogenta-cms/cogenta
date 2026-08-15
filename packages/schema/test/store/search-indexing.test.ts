import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { createSqliteSearch } from '../../src/search/sqlite.js'
import { type IndexingHarness, runSearchIndexingContract } from './search-indexing.contract.js'

/**
 * SQLite runs the contract as a plain unit test — no Docker, no service — and
 * it runs it **twice**: once with FTS5 and once on the substring fallback, the
 * degraded path AGENTS.md requires to be tested rather than assumed.
 *
 * The same suite runs against Postgres, MySQL and MariaDB in
 * `test/integration/search-indexing.test.ts`.
 */

async function harness(fts5: boolean): Promise<IndexingHarness> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-indexing-'))
  const db = await createSqliteHandle({ url: join(directory, 'store.db') })

  return {
    db,
    index: await createSqliteSearch({ db, fts5 }),
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

runSearchIndexingContract('sqlite (fts5)', () => harness(true))
runSearchIndexingContract('sqlite (no fts5, substring fallback)', () => harness(false))
