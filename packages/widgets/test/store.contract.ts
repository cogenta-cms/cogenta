import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWidgetStore, ensureWidgetTables, type WidgetStore } from '../src/index.js'

/**
 * One widget-store contract, played against SQLite by the unit suite and
 * against Postgres, MySQL and MariaDB by the integration suite.
 */
export function runWidgetStoreContract(
  label: string,
  open: () => Promise<{ readonly db: DatabaseHandle; readonly cleanup?: () => Promise<void> }>,
): void {
  describe(`createWidgetStore (${label})`, () => {
    let db: DatabaseHandle
    let cleanup: (() => Promise<void>) | undefined
    let store: WidgetStore

    beforeEach(async () => {
      const opened = await open()
      db = opened.db
      cleanup = opened.cleanup
      await ensureWidgetTables(db)
      await ensureWidgetTables(db)
      store = createWidgetStore({ db })
      // A shared server keeps rows between runs; every case starts empty.
      await store.clear()
    })

    afterEach(async () => {
      await db.close()
      await cleanup?.()
    })

    const search = (area = 'sidebar') => store.create({ area, type: 'search', title: 'Search' })

    it('stores a widget with its defaults and reads it back', async () => {
      const widget = await store.create({
        area: 'sidebar',
        type: 'recentEntries',
        title: '  Latest  ',
        settings: { collection: 'article' },
      })
      expect(widget).toMatchObject({ area: 'sidebar', position: 0, title: 'Latest', enabled: true })
      expect(widget.settings).toMatchObject({ count: 5 })
      expect(widget.visibility.pages.mode).toBe('all')
      expect(await store.read(widget.id)).toEqual(widget)
    })

    it('refuses what the vocabulary refuses, and a malformed area key', async () => {
      await expect(store.create({ area: 'sidebar', type: 'html' })).rejects.toMatchObject({
        code: 'WIDGET_INVALID',
      })
      await expect(store.create({ area: 'Side Bar', type: 'search' })).rejects.toMatchObject({
        code: 'WIDGET_INVALID',
      })
      expect(await store.list()).toHaveLength(0)
    })

    it('keeps positions contiguous through insert, move and delete', async () => {
      const a = await search()
      const b = await search()
      const c = await store.create({ area: 'sidebar', type: 'search', position: 0 })
      expect((await store.list({ area: 'sidebar' })).map((w) => w.id)).toEqual([c.id, a.id, b.id])

      await store.move(c.id, { area: 'footer-1', position: 0 })
      expect((await store.list({ area: 'sidebar' })).map((w) => [w.id, w.position])).toEqual([
        [a.id, 0],
        [b.id, 1],
      ])
      expect((await store.list({ area: 'footer-1' }))[0]?.id).toBe(c.id)

      await store.move(b.id, { area: 'sidebar', position: 0 })
      expect((await store.list({ area: 'sidebar' })).map((w) => w.id)).toEqual([b.id, a.id])

      expect(await store.delete(b.id)).toBe(true)
      expect((await store.list({ area: 'sidebar' })).map((w) => [w.id, w.position])).toEqual([
        [a.id, 0],
      ])
      expect(await store.delete(b.id)).toBe(false)
    })

    it('reorders an area only with exactly its widgets', async () => {
      const a = await search()
      const b = await search()
      await expect(store.reorder('sidebar', [a.id])).rejects.toMatchObject({
        code: 'WIDGET_INVALID',
      })
      const reordered = await store.reorder('sidebar', [b.id, a.id])
      expect(reordered.map((w) => w.id)).toEqual([b.id, a.id])
    })

    it('hides and edits a widget without losing its settings, and validates the edit', async () => {
      const widget = await store.create({
        area: 'sidebar',
        type: 'quote',
        settings: { text: 'Hi' },
      })
      const hidden = await store.update(widget.id, { enabled: false, updatedBy: 'u1' })
      expect(hidden).toMatchObject({ enabled: false, updatedBy: 'u1' })
      expect(hidden.settings).toMatchObject({ text: 'Hi' })
      await expect(store.update(widget.id, { settings: { text: '' } })).rejects.toMatchObject({
        code: 'WIDGET_INVALID',
      })
      await expect(store.update('missing', { enabled: true })).rejects.toMatchObject({
        code: 'WIDGET_NOT_FOUND',
      })
    })

    it('duplicates right after the original, hidden until shown', async () => {
      const a = await search()
      const b = await search()
      const copy = await store.duplicate(a.id)
      expect(copy).toMatchObject({ enabled: false, title: 'Search', position: 1 })
      expect((await store.list({ area: 'sidebar' })).map((w) => w.id)).toEqual([
        a.id,
        copy.id,
        b.id,
      ])
    })

    it('clears every widget for a site reset', async () => {
      await search()
      await search('footer-2')
      expect(await store.clear()).toBe(2)
      expect(await store.list()).toEqual([])
    })
  })
}
