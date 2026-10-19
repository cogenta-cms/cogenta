import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalStorage, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import {
  createContentStore,
  createSchemaTables,
  defineCollection,
  dropSchemaTables,
  f,
} from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { analyzeWordPress } from '../../src/wordpress/analyze.js'
import { WORDPRESS_IMPORT_COLLECTIONS } from '../../src/wordpress/collections.js'
import { importWordPress } from '../../src/wordpress/import.js'
import { preflightWordPressTarget } from '../../src/wordpress/target-preflight.js'

const INCOMPATIBLE = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.richText(),
  },
  permissions: { read: ['public'] },
})
const XML_PATH = fileURLToPath(new URL('../fixtures/full-featured.xml', import.meta.url))

async function tables(db: DatabaseHandle): Promise<readonly string[]> {
  const query =
    db.dialect === 'sqlite'
      ? sql`select name as table_name from sqlite_master where type = ${'table'}`
      : sql`select table_name as ${identifier('table_name', db.dialect)} from information_schema.tables where table_schema = ${db.dialect === 'postgres' ? sql`current_schema()` : sql`database()`}`
  return (await db.query<{ table_name: string }>(query)).rows.map((row) => row.table_name).sort()
}

export function runWordPressPreflightContract(
  label: string,
  open: () => Promise<DatabaseHandle>,
): void {
  describe(`WordPress target preflight — ${label}`, () => {
    it('rejects an incompatible existing post before writing content, authors, media or schema', async () => {
      const db = await open()
      const directory = await mkdtemp(join(tmpdir(), 'cogenta-wxr-preflight-'))
      try {
        await dropSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        await createSchemaTables(db, [INCOMPATIBLE])
        const store = createContentStore({ db, collection: INCOMPATIBLE })
        const existing = await store.create({ values: { title: 'Existing', slug: 'existing' } })
        const before = await tables(db)
        const xml = await readFile(XML_PATH, 'utf8')
        expect(() => analyzeWordPress(xml, [INCOMPATIBLE])).toThrowError(
          /existing "post" collection/u,
        )
        await expect(preflightWordPressTarget(db, [INCOMPATIBLE])).rejects.toMatchObject({
          code: 'IMPORT_MAPPING_INVALID',
        })
        // No declarations supplied here: the standalone CLI remains protected
        // by physical inspection, independently of the admin preflight.
        await expect(
          importWordPress(xml, { db, storage: createLocalStorage({ path: directory }) }),
        ).rejects.toMatchObject({
          code: 'IMPORT_MAPPING_INVALID',
          hint: expect.stringContaining('explicit reviewed schema migration'),
        })
        expect(await tables(db)).toEqual(before)
        expect((await store.list({ state: 'working' })).items.map((entry) => entry.id)).toEqual([
          existing.id,
        ])
        expect(await readdir(directory)).toEqual([])
      } finally {
        await dropSchemaTables(db, [INCOMPATIBLE])
        await db.close()
        await rm(directory, { recursive: true, force: true })
      }
    })

    it('accepts a fresh or compatible target without creating tables during preflight', async () => {
      const db = await open()
      try {
        await dropSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        const before = await tables(db)
        await preflightWordPressTarget(db)
        expect(await tables(db)).toEqual(before)
        await createSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        const created = await tables(db)
        await preflightWordPressTarget(db, WORDPRESS_IMPORT_COLLECTIONS)
        expect(await tables(db)).toEqual(created)
        expect(
          analyzeWordPress(await readFile(XML_PATH, 'utf8'), WORDPRESS_IMPORT_COLLECTIONS).counts
            .posts,
        ).toBeGreaterThan(0)
      } finally {
        await dropSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        await db.close()
      }
    })
  })
}
