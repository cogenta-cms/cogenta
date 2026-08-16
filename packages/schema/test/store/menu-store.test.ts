import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMenuStore, type MenuStore } from '../../src/store/menu-store.js'
import { ensureMenuTables } from '../../src/store/menu-tables.js'

describe('createMenuStore (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: MenuStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-menu-'))
    db = await createSqliteHandle({ url: join(directory, 'menu.db') })
    await ensureMenuTables(db)
    store = createMenuStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('creates a menu and finds it by name and locale', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    expect(menu.id).toBeTruthy()

    const found = await store.byName('main', 'en')
    expect(found?.id).toBe(menu.id)
  })

  it('allows the same name in two locales but refuses a duplicate within one', async () => {
    await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    await store.create({ name: 'main', locale: 'fr', label: 'Menu principal' })

    await expect(
      store.create({ name: 'main', locale: 'en', label: 'Again' }),
    ).rejects.toMatchObject({
      code: 'MENU_NAME_TAKEN',
    })
  })

  it('refuses to delete a menu that still has items unless cascade is asked for', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    await store.createItem(menu.id, { label: 'Home', kind: 'url', url: '/' })

    await expect(store.delete(menu.id)).rejects.toMatchObject({ code: 'MENU_ITEM_INVALID' })
    expect(await store.delete(menu.id, { cascade: true })).toBe(true)
    expect(await store.read(menu.id)).toBeNull()
  })

  it('requires a url for a url item and a target for an entry item', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })

    await expect(store.createItem(menu.id, { label: 'Bad', kind: 'url' })).rejects.toMatchObject({
      code: 'MENU_ITEM_INVALID',
    })
    await expect(
      store.createItem(menu.id, { label: 'Bad', kind: 'entry', targetCollection: 'page' }),
    ).rejects.toMatchObject({ code: 'MENU_ITEM_INVALID' })
  })

  it('nests items and lists them in tree order', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    const parent = await store.createItem(menu.id, { label: 'About', kind: 'submenu-placeholder' })
    const child = await store.createItem(menu.id, {
      label: 'Team',
      kind: 'url',
      url: '/team',
      parent: parent.id,
    })

    expect(child.depth).toBe(1)
    expect(child.parent).toBe(parent.id)

    const items = await store.listItems(menu.id)
    expect(items.map((item) => item.id)).toEqual([parent.id, child.id])
  })

  it('refuses to move an item under its own descendant', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    const parent = await store.createItem(menu.id, { label: 'About', kind: 'submenu-placeholder' })
    const child = await store.createItem(menu.id, {
      label: 'Team',
      kind: 'url',
      url: '/team',
      parent: parent.id,
    })

    await expect(store.moveItem(parent.id, child.id)).rejects.toMatchObject({ code: 'MENU_CYCLE' })
  })

  it('reorders siblings by swapping positions, and is a no-op at the edge', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    const first = await store.createItem(menu.id, { label: 'A', kind: 'url', url: '/a' })
    const second = await store.createItem(menu.id, { label: 'B', kind: 'url', url: '/b' })

    await store.reorderItem(second.id, 'up')
    const items = await store.listItems(menu.id)
    expect(items.map((item) => item.id)).toEqual([second.id, first.id])

    // Already first: moving up again changes nothing.
    const unchanged = await store.reorderItem(second.id, 'up')
    expect(unchanged.id).toBe(second.id)
  })

  it('refuses to delete an item with children unless cascade is asked for', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    const parent = await store.createItem(menu.id, { label: 'About', kind: 'submenu-placeholder' })
    await store.createItem(menu.id, { label: 'Team', kind: 'url', url: '/team', parent: parent.id })

    await expect(store.deleteItem(parent.id)).rejects.toMatchObject({ code: 'MENU_ITEM_INVALID' })
    expect(await store.deleteItem(parent.id, { cascade: true })).toBe(true)
    expect(await store.listItems(menu.id)).toHaveLength(0)
  })
})
