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

  it('requires a taxonomy and a term for a taxonomy item, and nothing for a home item', async () => {
    const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })

    await expect(
      store.createItem(menu.id, { label: 'Bad', kind: 'taxonomy', targetTaxonomy: 'topic' }),
    ).rejects.toMatchObject({ code: 'MENU_ITEM_INVALID' })

    const term = await store.createItem(menu.id, {
      label: 'Local news',
      kind: 'taxonomy',
      targetTaxonomy: 'topic',
      targetTermId: 'term-1',
    })
    expect(term.targetTaxonomy).toBe('topic')
    expect(term.targetTermId).toBe('term-1')

    const home = await store.createItem(menu.id, { label: 'Home', kind: 'home' })
    expect(home.kind).toBe('home')
  })

  describe('location (fiche 09, task 3)', () => {
    it('assigns a menu to a location and finds it back by location and locale', async () => {
      const menu = await store.create({
        name: 'main',
        locale: 'en',
        label: 'Main menu',
        location: 'primary',
      })
      expect(menu.location).toBe('primary')

      const found = await store.byLocation('primary', 'en')
      expect(found?.id).toBe(menu.id)
      expect(await store.byLocation('primary', 'fr')).toBeNull()
    })

    it('leaves location null by default — an old menu is simply unslotted', async () => {
      const menu = await store.create({ name: 'legacy', locale: 'en', label: 'Legacy menu' })
      expect(menu.location).toBeNull()
    })

    it('allows the same location in two locales but refuses a second menu at one location', async () => {
      await store.create({ name: 'main', locale: 'en', label: 'Main', location: 'primary' })
      await store.create({
        name: 'principal',
        locale: 'fr',
        label: 'Principal',
        location: 'primary',
      })

      await expect(
        store.create({ name: 'secondary', locale: 'en', label: 'Secondary', location: 'primary' }),
      ).rejects.toMatchObject({ code: 'MENU_LOCATION_TAKEN' })
    })

    it('reassigns the location that renders a slot, from the admin, without touching the other menu', async () => {
      const current = await store.create({
        name: 'main',
        locale: 'en',
        label: 'Main',
        location: 'primary',
      })
      const candidate = await store.create({ name: 'alt', locale: 'en', label: 'Alt menu' })

      // Changing the site's principal menu is exactly this: clear the old
      // holder, then assign the new one — no redeploy, no code change.
      await store.update(current.id, { location: null })
      const promoted = await store.update(candidate.id, { location: 'primary' })

      expect(promoted.location).toBe('primary')
      expect((await store.read(current.id))?.location).toBeNull()
      expect((await store.byLocation('primary', 'en'))?.id).toBe(candidate.id)
    })

    it('refuses reassigning a location already held by another menu', async () => {
      await store.create({ name: 'main', locale: 'en', label: 'Main', location: 'primary' })
      const other = await store.create({ name: 'alt', locale: 'en', label: 'Alt' })

      await expect(store.update(other.id, { location: 'primary' })).rejects.toMatchObject({
        code: 'MENU_LOCATION_TAKEN',
      })
    })
  })

  describe('reorderItems (fiche 09, task 2 — one transaction, never N calls)', () => {
    it('moves an item and its children down a level, and the order survives a reread', async () => {
      const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
      const about = await store.createItem(menu.id, { label: 'About', kind: 'submenu-placeholder' })
      const team = await store.createItem(menu.id, {
        label: 'Team',
        kind: 'url',
        url: '/team',
        parent: about.id,
      })
      const history = await store.createItem(menu.id, {
        label: 'History',
        kind: 'url',
        url: '/history',
        parent: about.id,
      })
      const contact = await store.createItem(menu.id, {
        label: 'Contact',
        kind: 'url',
        url: '/contact',
      })

      // Indent "Contact" under "About", as its third child, in one batch —
      // its own siblings are untouched and left out of `updates` entirely.
      const result = await store.reorderItems(menu.id, [
        { id: contact.id, parent: about.id, position: 2 },
      ])
      expect(result.map((item) => item.id)).toEqual([about.id, team.id, history.id, contact.id])
      expect(result.find((item) => item.id === contact.id)?.depth).toBe(1)

      const reread = await store.listItems(menu.id)
      expect(reread.map((item) => ({ id: item.id, parent: item.parent }))).toEqual([
        { id: about.id, parent: null },
        { id: team.id, parent: about.id },
        { id: history.id, parent: about.id },
        { id: contact.id, parent: about.id },
      ])
    })

    it('cascades a reparent to a descendant left out of the batch', async () => {
      const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
      const products = await store.createItem(menu.id, {
        label: 'Products',
        kind: 'submenu-placeholder',
      })
      const widgets = await store.createItem(menu.id, {
        label: 'Widgets',
        kind: 'submenu-placeholder',
        parent: products.id,
      })
      const gadget = await store.createItem(menu.id, {
        label: 'Gadget',
        kind: 'url',
        url: '/gadget',
        parent: widgets.id,
      })

      // Only "Widgets" moves to the top level in this batch — "Gadget" is
      // never named, yet it must follow its parent.
      const result = await store.reorderItems(menu.id, [
        { id: widgets.id, parent: null, position: 0 },
      ])
      const found = result.find((item) => item.id === gadget.id)
      expect(found?.parent).toBe(widgets.id)
      expect(found?.depth).toBe(1)
    })

    it('refuses a batch that would move an item under itself, even indirectly through another moving item', async () => {
      const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
      const a = await store.createItem(menu.id, { label: 'A', kind: 'submenu-placeholder' })
      const b = await store.createItem(menu.id, {
        label: 'B',
        kind: 'submenu-placeholder',
        parent: a.id,
      })

      // A one-at-a-time check would miss this: B is not (yet) A's ancestor,
      // but this batch would make A move under B *and* B stay under A.
      await expect(
        store.reorderItems(menu.id, [{ id: a.id, parent: b.id, position: 0 }]),
      ).rejects.toMatchObject({ code: 'MENU_CYCLE' })
    })

    it('refuses an update naming an item that is not part of the menu', async () => {
      const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
      await expect(
        store.reorderItems(menu.id, [{ id: 'not-an-item', parent: null, position: 0 }]),
      ).rejects.toMatchObject({ code: 'MENU_ITEM_NOT_FOUND' })
    })

    it('rewrites nothing when the batch is empty', async () => {
      const menu = await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
      const item = await store.createItem(menu.id, { label: 'A', kind: 'url', url: '/a' })
      const result = await store.reorderItems(menu.id, [])
      expect(result.map((entry) => entry.id)).toEqual([item.id])
    })
  })
})
