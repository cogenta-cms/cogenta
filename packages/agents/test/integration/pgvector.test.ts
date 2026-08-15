import process from 'node:process'
import { createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { createPgVectorStore } from '../../src/rag/vector/pgvector.js'
import { CONTRACT_DIMENSIONS, runVectorStoreContract } from '../rag/vector/vector-store.contract.js'

/**
 * The optimal tier of the `vector` need, against a real Postgres with the real
 * pgvector extension — the same contract suite the memory and file drivers run,
 * not a copy adapted to what SQL happens to do.
 *
 * Skipped **loudly** when the service is absent: a `describe.skip` naming the
 * variable that was unset, never a silent pass. There is no in-process
 * substitute for `vector(N)` and the `<=>` operator, and mocking the database
 * is forbidden by the project's own rules.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']

if (postgresUrl === undefined || postgresUrl === '') {
  describe.skip('VectorStore contract — pgvector', () => {
    it('skipped: COGENTA_TEST_POSTGRES_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  runVectorStoreContract('pgvector', async () => {
    const db = await createPostgresHandle({ url: postgresUrl, poolSize: 3 })
    return {
      store: await createPgVectorStore({
        db,
        dimensions: CONTRACT_DIMENSIONS,
        table: 'cogenta_vectors_test',
      }),
      dispose: () => db.close(),
    }
  })
}
