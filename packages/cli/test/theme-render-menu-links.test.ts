import { ANONYMOUS, createMenuRouter } from '@cogenta/api'
import { createSqliteHandle, sql } from '@cogenta/core'
import { createMenuStore, ensureMenuTables } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { fetchMenuLinksById } from '../src/commands/theme-render.js'

describe('public menu destination policy', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '\njavascript:alert(1)',
  ])('renders no link for the unsafe legacy destination %j', async (url) => {
    const db = await createSqliteHandle({ url: ':memory:' })
    try {
      await ensureMenuTables(db)
      const store = createMenuStore({ db })
      const menu = await store.create({ name: 'main', label: 'Main', locale: 'en' })
      const item = await store.createItem(menu.id, { label: 'Old item', kind: 'url', url: '/safe' })
      // Represents persisted/imported data predating validation, not a DB mock.
      await db.query(sql`update cogenta_menu_items set url = ${url} where id = ${item.id}`)
      const links = await fetchMenuLinksById(
        menu.id,
        'en',
        { menuRouter: createMenuRouter({ store }) },
        { actor: ANONYMOUS },
      )
      expect(links).toEqual([])
    } finally {
      await db.close()
    }
  })
})
