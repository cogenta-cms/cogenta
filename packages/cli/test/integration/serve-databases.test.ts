import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  createLogger,
  createMysqlHandle,
  createPostgresHandle,
  type DatabaseHandle,
  identifier,
  sql,
} from '@cogenta/core'
import { afterAll, describe, expect, it } from 'vitest'
import { runServe } from '../../src/commands/serve.js'
import { createOutput } from '../../src/output.js'

/**
 * `cogenta serve` started for real on each server database.
 *
 * Every package creates its own tables when the site assembles, and only a
 * few of them have a suite of their own on MySQL or Postgres. A site on
 * MySQL 8 refused to start because one column was named `grouping`, a
 * reserved word there; nothing short of booting the whole site sees that.
 */
const TARGETS = [
  ['postgres', 'COGENTA_TEST_POSTGRES_URL', createPostgresHandle],
  ['mysql', 'COGENTA_TEST_MYSQL_URL', createMysqlHandle],
  ['mariadb', 'COGENTA_TEST_MARIADB_URL', createMysqlHandle],
] as const

async function siteTables(db: DatabaseHandle): Promise<string[]> {
  const result =
    db.dialect === 'postgres'
      ? await db.query<{ name: string }>(
          sql`select tablename as name from pg_tables where schemaname = current_schema()`,
        )
      : await db.query<{ name: string }>(
          sql`select table_name as name from information_schema.tables where table_schema = database()`,
        )
  return result.rows.map((row) => row.name).filter((name) => name.startsWith('cogenta_'))
}

/** Leaves the shared test database as the other suites expect to find it. */
async function dropSiteTables(db: DatabaseHandle): Promise<void> {
  if (db.dialect !== 'postgres') await db.query(sql`set foreign_key_checks = 0`)
  for (const name of await siteTables(db)) {
    await db.query(
      db.dialect === 'postgres'
        ? sql`drop table if exists ${identifier(name, db.dialect)} cascade`
        : sql`drop table if exists ${identifier(name, db.dialect)}`,
    )
  }
  if (db.dialect !== 'postgres') await db.query(sql`set foreign_key_checks = 1`)
}

async function project(url: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-serve-db-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(url)} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
]
`,
    'utf8',
  )
  return root
}

for (const [label, variable, connect] of TARGETS) {
  const url = process.env[variable]
  if (url === undefined || url === '') {
    describe.skip(`cogenta serve on ${label}`, () => {
      it(`skipped: ${variable} is not set`, () => undefined)
    })
    continue
  }

  describe(`cogenta serve on ${label}`, () => {
    const handles: DatabaseHandle[] = []
    const open = async (): Promise<DatabaseHandle> => {
      const db = await connect({ url, poolSize: 2 })
      handles.push(db)
      return db
    }

    afterAll(async () => {
      const db = await open()
      await dropSiteTables(db)
      for (const handle of handles) await handle.close()
    })

    it('creates every table the site needs and answers its first requests', async () => {
      await dropSiteTables(await open())
      const root = await project(url)
      const errors: string[] = []
      const controller = new AbortController()
      let bound: (address: { host: string; port: number }) => void = () => undefined
      const listening = new Promise<{ host: string; port: number }>((resolve) => {
        bound = resolve
      })
      const done = runServe({
        cwd: root,
        env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
        logger: createLogger({ level: 'silent' }),
        out: createOutput(() => undefined, false),
        stderr: (line: string) => {
          errors.push(line)
        },
        port: 0,
        signal: controller.signal,
        onListening: (address) => bound(address),
      })
      try {
        const address = await Promise.race([
          listening,
          done.then((code) => {
            throw new Error(`serve exited with ${code} before listening:\n${errors.join('\n')}`)
          }),
        ])
        const base = `http://${address.host}:${address.port}`

        expect((await fetch(`${base}/api/shell-status`)).status).toBe(200)
        expect((await fetch(`${base}/api/content/article`)).status).toBe(200)
        expect((await fetch(`${base}/sitemap.xml`)).status).toBe(200)
        expect((await fetch(`${base}/une-page-qui-n-existe-pas`)).status).toBe(404)
        expect(await siteTables(await open())).toContain('cogenta_channel_preferences')
      } finally {
        controller.abort()
        await done
      }
    }, 120_000)
  })
}
