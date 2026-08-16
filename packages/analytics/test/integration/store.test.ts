import { createMysqlHandle, createPostgresHandle, type DatabaseHandle } from '@cogenta/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAnalyticsStore } from '../../src/store.js'
import { ensureAnalyticsTables } from '../../src/tables.js'

/**
 * Same contract as `test/store.test.ts`, run against the two real dialects
 * SQLite is standing in for elsewhere in this package's unit suite
 * (AGENTS.md: "the driver dégradé est testé, pas seulement l'optimal" — the
 * same rule cuts the other way here, the *optimal* drivers need their own
 * proof too). A missing service is skipped loudly, naming the variable that
 * was unset, rather than passing green having never run — same pattern as
 * `packages/schema/test/integration/search-indexing.test.ts`.
 */

const postgresUrl = process.env.COGENTA_TEST_POSTGRES_URL
const mysqlUrl = process.env.COGENTA_TEST_MYSQL_URL

const targets: readonly {
  readonly label: string
  readonly url: string | undefined
  readonly variable: string
  readonly connect: (url: string) => Promise<DatabaseHandle>
}[] = [
  {
    label: 'Postgres',
    url: postgresUrl,
    variable: 'COGENTA_TEST_POSTGRES_URL',
    connect: (url) => createPostgresHandle({ url }),
  },
  {
    label: 'MySQL',
    url: mysqlUrl,
    variable: 'COGENTA_TEST_MYSQL_URL',
    connect: (url) => createMysqlHandle({ url }),
  },
]

for (const target of targets) {
  if (target.url === undefined) {
    describe.skip(`@cogenta/analytics store — ${target.label}`, () => {
      it(`skipped: ${target.variable} is not set — run \`pnpm services:up\``, () => undefined)
    })
    continue
  }

  describe(`@cogenta/analytics store — ${target.label}`, () => {
    let db: DatabaseHandle

    beforeAll(async () => {
      db = await target.connect(target.url as string)
      await ensureAnalyticsTables(db)
    })

    afterAll(async () => {
      await db.close()
    })

    it('records an event and reflects it in the summary', async () => {
      const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))
      const result = await store.recordEvent({
        path: '/integration-check',
        ip: '203.0.113.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      })
      expect(result.recorded).toBe(true)

      const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
      expect(summary.topPages.some((page) => page.path === '/integration-check')).toBe(true)
    })
  })
}
