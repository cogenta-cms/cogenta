import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatternStore } from '../../src/store/pattern-store.js'
import { createPatternStore } from '../../src/store/pattern-store.js'
import { ensurePatternTables } from '../../src/store/pattern-tables.js'

/**
 * The single contract suite for the page builder's pattern/model library
 * (fiche 43 sub-chantier A), written once and run against every dialect —
 * SQLite as a unit test, Postgres/MySQL/MariaDB as integration tests
 * (`test/integration/pattern-store.test.ts`) — the same split every other
 * real data store in this package uses (`taxonomy-store.contract.ts`,
 * `content-store` tests). `menu-store.ts`, the closest sibling (also a
 * not-schema-declared, one-fixed-table store), predates this discipline and
 * has never had a multi-dialect suite of its own; that gap is not a
 * precedent to repeat here, since AGENTS.md's Definition of Done requires
 * three-dialect coverage for any code that touches data, without an
 * exception for a table that happens to be small.
 */

export interface PatternStoreHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

const HERO_BLOCK = { key: 'b1', type: 'hero', data: { title: 'Welcome' } }
const CTA_BLOCK = { key: 'b2', type: 'cta', data: { title: 'Try it' } }

export function runPatternStoreContract(
  name: string,
  create: () => Promise<PatternStoreHarness>,
): void {
  describe(`Pattern store contract — ${name}`, () => {
    let harness: PatternStoreHarness
    let db: DatabaseHandle
    let store: PatternStore

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      await ensurePatternTables(db)
      store = createPatternStore({ db })
    })

    afterEach(async () => {
      // Closed before the harness disposes anything (a SQLite harness
      // removes the temp directory the database file lives in) — on
      // Windows, an unclosed handle still holds the `-wal`/`-shm` files
      // open, which turns that removal into a real `EBUSY`, not a flake.
      await db.close()
      await harness.dispose?.()
    })

    it('creates a pattern and reads it back with its blocks intact', async () => {
      const pattern = await store.create({
        name: 'Hero band',
        category: 'headers',
        kind: 'pattern',
        blocks: [HERO_BLOCK],
      })
      expect(pattern.id).toBeTruthy()
      expect(pattern.provenance).toBe('human')

      const found = await store.read(pattern.id)
      expect(found?.name).toBe('Hero band')
      expect(found?.blocks).toEqual([HERO_BLOCK])
    })

    it('defaults provenance to human, and keeps a caller-supplied one', async () => {
      const human = await store.create({ name: 'A', kind: 'pattern', blocks: [HERO_BLOCK] })
      expect(human.provenance).toBe('human')

      const generated = await store.create({
        name: 'B',
        kind: 'pattern',
        blocks: [HERO_BLOCK],
        provenance: 'generated',
        provenanceDetail: { agent: 'Cogenta Designer', model: 'test', at: '2026-08-26' },
      })
      expect(generated.provenance).toBe('generated')
      expect(generated.provenanceDetail).toEqual({
        agent: 'Cogenta Designer',
        model: 'test',
        at: '2026-08-26',
      })
    })

    it('lists patterns and templates separately by kind', async () => {
      await store.create({ name: 'Hero band', kind: 'pattern', blocks: [HERO_BLOCK] })
      await store.create({
        name: 'Landing page',
        kind: 'template',
        blocks: [HERO_BLOCK, CTA_BLOCK],
      })

      const patterns = await store.list({ kind: 'pattern' })
      expect(patterns).toHaveLength(1)
      expect(patterns[0]?.name).toBe('Hero band')

      const templates = await store.list({ kind: 'template' })
      expect(templates).toHaveLength(1)
      expect(templates[0]?.blocks).toEqual([HERO_BLOCK, CTA_BLOCK])

      expect(await store.list()).toHaveLength(2)
    })

    it('renames and re-categorises without touching the stored blocks', async () => {
      const pattern = await store.create({
        name: 'Hero band',
        category: 'headers',
        kind: 'pattern',
        blocks: [HERO_BLOCK],
      })

      const renamed = await store.update(pattern.id, { name: 'Renamed', category: 'footers' })
      expect(renamed.name).toBe('Renamed')
      expect(renamed.category).toBe('footers')
      expect(renamed.blocks).toEqual([HERO_BLOCK])

      const cleared = await store.update(pattern.id, { category: null })
      expect(cleared.category).toBeNull()
    })

    it('rejects an update naming a pattern that does not exist', async () => {
      await expect(store.update('missing', { name: 'x' })).rejects.toMatchObject({
        code: 'PATTERN_UNKNOWN',
      })
    })

    it('deletes a pattern, and answers false for one already gone', async () => {
      const pattern = await store.create({
        name: 'Hero band',
        kind: 'pattern',
        blocks: [HERO_BLOCK],
      })
      expect(await store.delete(pattern.id)).toBe(true)
      expect(await store.read(pattern.id)).toBeNull()
      expect(await store.delete(pattern.id)).toBe(false)
    })
  })
}
