import type { DatabaseHandle } from '@cogenta/core'
import { CogentaError, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '../../src/id.js'
import type { TermArchiveDisplayStore } from '../../src/store/term-archive-display-store.js'
import { createTermArchiveDisplayStore } from '../../src/store/term-archive-display-store.js'
import {
  ensureTermArchiveDisplayTable,
  TERM_ARCHIVE_DISPLAY_MODES,
  TERM_ARCHIVE_DISPLAY_TABLE,
} from '../../src/store/term-archive-display-tables.js'

/**
 * The single contract suite for the term archive display setting (a
 * host-owned presentation setting kept outside contract A), written once and
 * run against every dialect — SQLite as a unit test, Postgres/MySQL/MariaDB
 * as integration tests (`test/integration/term-archive-display-store.test.ts`),
 * the same split `pattern-store.contract.ts` uses.
 */

export interface TermArchiveDisplayHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

export function runTermArchiveDisplayStoreContract(
  name: string,
  create: () => Promise<TermArchiveDisplayHarness>,
): void {
  describe(`Term archive display store contract — ${name}`, () => {
    let harness: TermArchiveDisplayHarness
    let db: DatabaseHandle
    let store: TermArchiveDisplayStore

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      // Emptied, not merely ensured: the real servers are one shared database
      // whose rows would otherwise accumulate across tests.
      await db.query(
        sql`drop table if exists ${identifier(TERM_ARCHIVE_DISPLAY_TABLE, db.dialect)}`,
      )
      await ensureTermArchiveDisplayTable(db)
      store = createTermArchiveDisplayStore({ db })
    })

    afterEach(async () => {
      try {
        await db.close()
      } finally {
        await harness.dispose?.()
      }
    })

    it('reads a term with no stored setting as entries', async () => {
      expect(await store.get('category', newId())).toBe('entries')
    })

    it('stores each non-default mode and reads it back', async () => {
      for (const mode of TERM_ARCHIVE_DISPLAY_MODES) {
        const termId = newId()
        expect(await store.set('category', termId, mode)).toBe(mode)
        expect(await store.get('category', termId)).toBe(mode)
      }
    })

    it('replaces the previous mode of a term instead of adding a second row', async () => {
      const termId = newId()
      await store.set('category', termId, 'subtree')
      await store.set('category', termId, 'subterms')
      expect(await store.get('category', termId)).toBe('subterms')

      const rows = await db.query(
        sql`select * from ${identifier(TERM_ARCHIVE_DISPLAY_TABLE, db.dialect)}`,
      )
      expect(rows.rows).toHaveLength(1)
    })

    it('does not store the default: setting entries removes the row', async () => {
      const termId = newId()
      await store.set('category', termId, 'subtree')
      await store.set('category', termId, 'entries')
      expect(await store.get('category', termId)).toBe('entries')

      const rows = await db.query(
        sql`select * from ${identifier(TERM_ARCHIVE_DISPLAY_TABLE, db.dialect)}`,
      )
      expect(rows.rows).toHaveLength(0)
    })

    it('keeps the same term id independent across two taxonomies', async () => {
      const termId = newId()
      await store.set('category', termId, 'subtree')
      expect(await store.get('category', termId)).toBe('subtree')
      expect(await store.get('tag', termId)).toBe('entries')
    })

    it('lists only the non-default modes of one taxonomy', async () => {
      const first = newId()
      const second = newId()
      const other = newId()
      await store.set('category', first, 'subterms')
      await store.set('category', second, 'subtree-and-subterms')
      await store.set('tag', other, 'subtree')

      const modes = await store.getMany('category')
      expect(modes.size).toBe(2)
      expect(modes.get(first)).toBe('subterms')
      expect(modes.get(second)).toBe('subtree-and-subterms')
    })

    it('forgets one term, and reports whether there was anything to forget', async () => {
      const termId = newId()
      await store.set('category', termId, 'subtree')
      expect(await store.remove('category', termId)).toBe(true)
      expect(await store.remove('category', termId)).toBe(false)
      expect(await store.get('category', termId)).toBe('entries')
    })

    it('forgets several terms at once and leaves the others alone', async () => {
      const gone = [newId(), newId()]
      const kept = newId()
      for (const termId of [...gone, kept]) await store.set('category', termId, 'subtree')

      expect(await store.removeMany('category', gone)).toBe(2)
      expect(await store.get('category', kept)).toBe('subtree')
      expect(await store.get('category', gone[0] ?? '')).toBe('entries')
    })

    it('refuses an unknown mode with a typed error that names the valid ones', async () => {
      const error = await store
        .set('category', newId(), 'everything' as unknown as 'entries')
        .catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('TERM_ARCHIVE_DISPLAY_INVALID')
      expect((error as CogentaError).hint).toContain('subtree-and-subterms')
    })

    it('answers the default for an id no term can carry, on every engine', async () => {
      expect(await store.get('category', 'not-an-id')).toBe('entries')
      expect(await store.remove('category', 'not-an-id')).toBe(false)
    })

    it('survives two writers racing on the same term', async () => {
      const termId = newId()
      await Promise.all([
        store.set('category', termId, 'subtree'),
        store.set('category', termId, 'subterms'),
      ])
      expect(['subtree', 'subterms']).toContain(await store.get('category', termId))
    })
  })
}
