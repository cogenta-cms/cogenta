import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { createSqliteSearch } from '../../src/search/sqlite.js'
import { runSearchContract } from './search.contract.js'

/**
 * SQLite runs the contract as a plain unit test — no Docker, no service — and
 * it runs it **twice**.
 *
 * The second run forces the substring fallback. AGENTS.md requires the degraded
 * driver to be tested rather than assumed, and this is the one place where the
 * degraded path is not a different server but a different code path inside the
 * same file: a build of `node:sqlite` without FTS5. Everything the contract
 * asserts — the right document found, no draft, no other locale — has to hold
 * there too. Only the ranking is allowed to disappear, and nothing in the
 * contract depends on ranking.
 */

async function harness(fts5: boolean): Promise<{
  db: Awaited<ReturnType<typeof createSqliteHandle>>
  index: Awaited<ReturnType<typeof createSqliteSearch>>
  dispose: () => Promise<void>
}> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-search-'))
  const db = await createSqliteHandle({ url: join(directory, 'search.db') })

  return {
    db,
    index: await createSqliteSearch({ db, fts5 }),
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

runSearchContract('sqlite (fts5)', () => harness(true))
runSearchContract('sqlite (no fts5, substring fallback)', () => harness(false))
