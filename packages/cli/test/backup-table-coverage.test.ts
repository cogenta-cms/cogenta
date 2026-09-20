import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import type { CollectionDefinition, TaxonomyDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { BACKUP_EXCLUDED_TABLES, backupTables } from '../src/commands/backup.js'
import { run } from '../src/index.js'
import { startServer } from './helpers/serve-harness.js'

/**
 * The guard that was missing when `cogenta backup create` archived a quarter
 * of the database while its own `--help` promised "every table".
 *
 * Nothing here asserts a hand-written list of names: it boots a real site,
 * asks the database what tables it actually has, and requires every one of
 * them to be either backed up or named in `BACKUP_EXCLUDED_TABLES` with a
 * reason. A table added to any package tomorrow fails this test until
 * somebody decides, in writing, which of the two it is.
 */

const NOTE: CollectionDefinition = {
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: {
    body: { kind: 'text', options: { max: 500 } },
    cover: { kind: 'media', options: {} },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}

// A taxonomy indexes its labels by locale, unlike a collection's plain
// strings just above — the one difference between the two shapes.
const TOPIC: TaxonomyDefinition = {
  name: 'topic',
  labels: { singular: { en: 'Topic' }, plural: { en: 'Topics' } },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}

const COLLECTIONS: readonly CollectionDefinition[] = [NOTE]
const TAXONOMIES: readonly TaxonomyDefinition[] = [TOPIC]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-backup-coverage-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Coverage site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}
export const taxonomies = ${JSON.stringify(TAXONOMIES, null, 2)}
`,
    'utf8',
  )
  await mkdir(join(root, 'migrations'), { recursive: true })
  return root
}

/** Every table the engine really has, asked of the engine rather than of the code. */
async function tablesOf(db: DatabaseHandle): Promise<readonly string[]> {
  const result = await db.query<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' order by name`,
  )
  // `sqlite_*` is SQLite's own bookkeeping (`sqlite_sequence`, `sqlite_stat1`),
  // not this product's data.
  return result.rows.map((row) => row.name).filter((name) => !name.startsWith('sqlite_'))
}

/** Row count per table — the two sides of the restore diff. */
async function rowCounts(db: DatabaseHandle): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const name of await tablesOf(db)) {
    if (name in BACKUP_EXCLUDED_TABLES) continue
    const result = await db.query<{ n: number }>(
      sql`select count(*) as n from ${identifier(name, db.dialect)}`,
    )
    counts.set(name, Number(result.rows[0]?.n ?? 0))
  }
  return counts
}

/** Boots the site once so every package creates the tables it owns, then stops it. */
async function serveOnce(root: string): Promise<void> {
  const server = await startServer(root)
  await server.stop()
}

describe('cogenta backup create', () => {
  it('names every table a real site has, or says in writing why it is left out', async () => {
    const root = await project()
    await serveOnce(root)

    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const present = await tablesOf(db)
    await db.close()

    const backedUp = new Set(await backupTables(root))
    const unaccounted = present.filter(
      (name) => !backedUp.has(name) && !(name in BACKUP_EXCLUDED_TABLES),
    )

    expect(
      unaccounted,
      `These tables exist in a real site's database but are neither in the backup nor in BACKUP_EXCLUDED_TABLES. Add each to packages/cli/src/commands/backup.ts — to the backup if it holds data a restore must bring back, to the exclusion map with a reason if it does not.`,
    ).toEqual([])
    // A site with no table at all would satisfy the assertion above; this
    // says the walk really happened.
    expect(present.length).toBeGreaterThan(50)
  })

  it('never names a table the site does not have', async () => {
    const root = await project()
    await serveOnce(root)

    // `backup create` creates anything still missing before it dumps; the
    // backup list is only honest if every name in it survives that.
    const errs: string[] = []
    const code = await run({
      argv: ['backup', 'create', '--cwd', root],
      stdout: () => undefined,
      stderr: (t) => void errs.push(t),
      env: {},
    })
    expect(errs.join('')).toBe('')
    expect(code).toBe(0)
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const present = new Set(await tablesOf(db))
    await db.close()

    const phantom = (await backupTables(root)).filter((name) => !present.has(name))
    expect(
      phantom,
      'The backup names tables the database does not have — a renamed or removed table left behind in backup.ts. `dumpTable` fails on the first one.',
    ).toEqual([])
  })

  it('restores the same rows into a fresh site, table for table', async () => {
    const source = await project()
    const target = await project()
    await serveOnce(source)

    // Real content, in the real shape a site has it: an entry, a taxonomy
    // term, a menu, a redirect, a comment setting, a product.
    const server = await startServer(source)
    await server.stop()
    const seedDb = await createSqliteHandle({ url: join(source, 'site.db') })
    const { createContentStore, createTaxonomyStore, createMenuStore, createRedirectStore } =
      await import('@cogenta/schema')
    const term = await createTaxonomyStore({ db: seedDb, taxonomy: TOPIC }).create({
      slug: 'releases',
      labels: { en: 'Releases' },
    })
    await createContentStore({ db: seedDb, collection: NOTE }).create({
      status: 'published',
      values: { body: 'Hello from the source site', cover: null },
    })
    const menus = createMenuStore({ db: seedDb })
    const menu = await menus.create({ name: 'main', locale: 'en', label: 'Main' })
    await menus.createItem(menu.id, { label: 'Home', kind: 'url', url: '/' })
    await createRedirectStore({ db: seedDb }).add({
      from: '/old',
      to: '/new',
      status: 301,
      reason: 'manual',
    })
    const { createCatalogStore } = await import('@cogenta/commerce')
    await createCatalogStore(seedDb).createProduct({
      handle: 'a-thing',
      title: 'A thing',
      status: 'active',
    })
    expect(term.slug).toBe('releases')
    await seedDb.close()

    const created = await run({
      argv: ['backup', 'create', '--cwd', source],
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
    })
    expect(created).toBe(0)

    const files = await readdir(join(source, '.cogenta', 'backups'))
    const file = files[0]
    if (file === undefined) throw new Error('expected exactly one backup file')

    const applied = await run({
      argv: ['restore', 'apply', join(source, '.cogenta', 'backups', file), '--cwd', target],
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
    })
    expect(applied).toBe(0)

    const sourceDb = await createSqliteHandle({ url: join(source, 'site.db') })
    const targetDb = await createSqliteHandle({ url: join(target, 'site.db') })
    const before = await rowCounts(sourceDb)
    const after = await rowCounts(targetDb)
    await sourceDb.close()
    await targetDb.close()

    const missing = [...before.keys()].filter((name) => !after.has(name))
    expect(missing, 'Tables the source has and the restored target does not.').toEqual([])

    const differing = [...before.entries()]
      .filter(([name, count]) => after.get(name) !== count)
      .map(([name, count]) => `${name}: ${count} in source, ${after.get(name) ?? 0} restored`)
    expect(differing, 'Tables whose row count did not survive the round trip.').toEqual([])

    // And the counts are not all zero — a backup of an empty site would pass
    // the diff above without proving anything.
    expect([...before.values()].reduce((sum, n) => sum + n, 0)).toBeGreaterThan(5)
  })
})
