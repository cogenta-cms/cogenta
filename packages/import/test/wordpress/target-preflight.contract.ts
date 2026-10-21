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
    it('rejects an incompatible existing post, found only by inspecting the tables, before writing anything', async () => {
      const db = await open()
      const directory = await mkdtemp(join(tmpdir(), 'cogenta-wxr-preflight-'))
      try {
        await dropSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        await createSchemaTables(db, [INCOMPATIBLE])
        const store = createContentStore({ db, collection: INCOMPATIBLE })
        const existing = await store.create({ values: { title: 'Existing', slug: 'existing' } })
        const before = await tables(db)
        const xml = await readFile(XML_PATH, 'utf8')
        // No declarations supplied here: the standalone CLI remains protected
        // by physical inspection, independently of the admin preflight.
        await expect(preflightWordPressTarget(db)).rejects.toMatchObject({
          code: 'IMPORT_MAPPING_INVALID',
        })
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

    it('maps onto a site collection of its own shape instead of refusing it', async () => {
      const db = await open()
      const directory = await mkdtemp(join(tmpdir(), 'cogenta-wxr-mapped-'))
      try {
        await dropSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        await createSchemaTables(db, [INCOMPATIBLE])
        const store = createContentStore({ db, collection: INCOMPATIBLE })
        const existing = await store.create({ values: { title: 'Existing', slug: 'existing' } })
        const xml = await readFile(XML_PATH, 'utf8')

        const preview = analyzeWordPress(xml, [INCOMPATIBLE])
        expect(preview.targets.post).toMatchObject({
          collection: 'post',
          mapped: true,
          fields: { title: 'title', slug: 'slug', body: 'body' },
        })
        // What the site's model has no field for is named, not invented.
        expect(preview.targets.post.unmapped).toEqual(
          expect.arrayContaining(['excerpt', 'category', 'tags', 'customFields']),
        )
        expect(preview.targets.category).toBeNull()
        await preflightWordPressTarget(db, [INCOMPATIBLE])

        const report = await importWordPress(xml, {
          db,
          collections: [INCOMPATIBLE],
          storage: createLocalStorage({ path: directory }),
        })
        expect(report.imported.posts).toBeGreaterThan(0)
        // Categories have nowhere to go on this site: reported, not written to an invisible table.
        expect(report.imported.categories).toBe(0)
        expect(report.warnings.some((warning) => /categories were not imported/u.test(warning))).toBe(
          true,
        )

        const items = (await store.list({ state: 'working', limit: 100 })).items
        expect(items.length).toBe(report.imported.posts + 1)
        expect(items.some((entry) => entry.id === existing.id)).toBe(true)
        const imported = items.find((entry) => entry.id !== existing.id)
        expect(Array.isArray(imported?.values['body'])).toBe(true)
      } finally {
        await dropSchemaTables(db, [INCOMPATIBLE])
        await dropSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
        await db.close()
        await rm(directory, { recursive: true, force: true })
      }
    })

    it('says which collection cannot receive the import when it has no text field for a title', async () => {
      const unusable = defineCollection({
        name: 'post',
        labels: { singular: 'Post', plural: 'Posts' },
        fields: { cover: f.media() },
        permissions: { read: ['public'] },
      })
      const xml = await readFile(XML_PATH, 'utf8')
      expect(() => analyzeWordPress(xml, [unusable])).toThrowError(/"post" collection cannot/u)
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
