import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createMenuStore, ensureMenuTables, type MenuStore } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMenuRouter, type MenuRouter } from '../../src/rest/menu-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * The menu transport, against a real SQLite database — never a mock
 * (AGENTS.md).
 *
 * Read is public; write is `admin`/`editor` only — a fixed rule (unlike a
 * collection or a taxonomy, a menu carries no per-site permission
 * configuration), so the R4 tests below cover exactly the three actors the
 * rule distinguishes: public, editor and viewer.
 */

const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const VIEWER: Actor = { id: 'user-viewer', roles: ['viewer'] }

const asPublic: AccessContext = { actor: ANONYMOUS }
const asEditor: AccessContext = { actor: EDITOR }
const asAdmin: AccessContext = { actor: ADMIN }
const asViewer: AccessContext = { actor: VIEWER }

interface SerialisedMenu {
  readonly id: string
  readonly name: string
  readonly locale: string
  readonly label: string
  readonly location: string | null
}

interface SerialisedItem {
  readonly id: string
  readonly parent: string | null
  readonly kind: string
  readonly position: number
  readonly resolvedLabel?: string
  readonly resolvedRoute?: string | null
  readonly resolvedHealth?: string
}

describe('createMenuRouter', () => {
  let directory: string
  let db: DatabaseHandle
  let store: MenuStore
  let router: MenuRouter

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-menu-router-'))
    db = await createSqliteHandle({ url: join(directory, 'menu.db') })
    await ensureMenuTables(db)
    store = createMenuStore({ db })
    router = createMenuRouter({
      store,
      resolveEntry: async (collection, entryId) =>
        collection === 'page' && entryId === 'known'
          ? { label: 'About us', route: '/about-us' }
          : null,
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('lets anyone list and read menus', async () => {
    await store.create({ name: 'main', locale: 'en', label: 'Main menu' })

    const list = await router.handle({ method: 'GET', path: '/api/menus', query: {} }, asPublic)
    expect(list.status).toBe(200)
    expect((list.body as { data: SerialisedMenu[] }).data).toHaveLength(1)
  })

  it('refuses menu creation to a viewer and to an anonymous caller', async () => {
    const asViewerResponse = await router.handle(
      {
        method: 'POST',
        path: '/api/menus',
        query: {},
        body: { name: 'main', locale: 'en', label: 'Main' },
      },
      asViewer,
    )
    expect(asViewerResponse.status).toBe(403)

    const anonymous = await router.handle(
      {
        method: 'POST',
        path: '/api/menus',
        query: {},
        body: { name: 'main', locale: 'en', label: 'Main' },
      },
      asPublic,
    )
    expect(anonymous.status).toBe(403)
  })

  it('lets an editor create a menu, add items, and resolves an entry item', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/menus',
        query: {},
        body: { name: 'main', locale: 'en', label: 'Main menu' },
      },
      asEditor,
    )
    expect(created.status).toBe(201)
    const menu = (created.body as { data: SerialisedMenu }).data

    const urlItem = await router.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items`,
        query: {},
        body: { label: 'Home', kind: 'url', url: '/' },
      },
      asEditor,
    )
    expect(urlItem.status).toBe(201)

    const entryItem = await router.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items`,
        query: {},
        body: { label: 'About', kind: 'entry', targetCollection: 'page', targetEntryId: 'known' },
      },
      asEditor,
    )
    expect(entryItem.status).toBe(201)
    const resolved = (entryItem.body as { data: SerialisedItem }).data
    expect(resolved.resolvedLabel).toBe('About us')
    expect(resolved.resolvedRoute).toBe('/about-us')

    const read = await router.handle(
      { method: 'GET', path: `/api/menus/${menu.id}`, query: {} },
      asPublic,
    )
    expect(read.status).toBe(200)
    const body = read.body as { data: { items: SerialisedItem[] } }
    expect(body.data.items).toHaveLength(2)
  })

  it('resolves a menu by name, and refuses ambiguity across locales without ?locale=', async () => {
    await store.create({ name: 'main', locale: 'en', label: 'Main menu' })
    await store.create({ name: 'main', locale: 'fr', label: 'Menu principal' })

    const ambiguous = await router.handle(
      { method: 'GET', path: '/api/menus/by-name/main', query: {} },
      asPublic,
    )
    expect(ambiguous.status).toBe(400)

    const disambiguated = await router.handle(
      { method: 'GET', path: '/api/menus/by-name/main', query: { locale: 'fr' } },
      asPublic,
    )
    expect(disambiguated.status).toBe(200)
    expect((disambiguated.body as { data: { label: string } }).data.label).toBe('Menu principal')
  })

  it('reorders and moves items, refused to a viewer', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/menus',
        query: {},
        body: { name: 'main', locale: 'en', label: 'Main menu' },
      },
      asAdmin,
    )
    const menu = (created.body as { data: SerialisedMenu }).data

    const first = (
      (
        await router.handle(
          {
            method: 'POST',
            path: `/api/menus/${menu.id}/items`,
            query: {},
            body: { label: 'A', kind: 'url', url: '/a' },
          },
          asAdmin,
        )
      ).body as { data: SerialisedItem }
    ).data
    const second = (
      (
        await router.handle(
          {
            method: 'POST',
            path: `/api/menus/${menu.id}/items`,
            query: {},
            body: { label: 'B', kind: 'url', url: '/b' },
          },
          asAdmin,
        )
      ).body as { data: SerialisedItem }
    ).data

    const refused = await router.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items/${second.id}/reorder`,
        query: {},
        body: { direction: 'up' },
      },
      asViewer,
    )
    expect(refused.status).toBe(403)

    const reordered = await router.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items/${second.id}/reorder`,
        query: {},
        body: { direction: 'up' },
      },
      asAdmin,
    )
    expect(reordered.status).toBe(200)

    const listed = await router.handle(
      { method: 'GET', path: `/api/menus/${menu.id}`, query: {} },
      asPublic,
    )
    const items = (listed.body as { data: { items: SerialisedItem[] } }).data.items
    expect(items.map((item) => item.id)).toEqual([second.id, first.id])
  })

  it('deletes a menu only when empty, or when cascade is asked for', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/menus',
        query: {},
        body: { name: 'main', locale: 'en', label: 'Main menu' },
      },
      asAdmin,
    )
    const menu = (created.body as { data: SerialisedMenu }).data
    await router.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items`,
        query: {},
        body: { label: 'A', kind: 'url', url: '/a' },
      },
      asAdmin,
    )

    const blocked = await router.handle(
      { method: 'DELETE', path: `/api/menus/${menu.id}`, query: {} },
      asAdmin,
    )
    expect(blocked.status).toBe(400)

    const cascaded = await router.handle(
      { method: 'DELETE', path: `/api/menus/${menu.id}`, query: { cascade: 'true' } },
      asAdmin,
    )
    expect(cascaded.status).toBe(204)
  })

  it('accepts a "taxonomy" and a "home" item, resolving the taxonomy label through resolveTerm', async () => {
    const withTerms = createMenuRouter({
      store,
      resolveTerm: async (taxonomy, termId) =>
        taxonomy === 'topic' && termId === 'local-news'
          ? { label: 'Local news', route: null }
          : null,
    })

    const created = await withTerms.handle(
      {
        method: 'POST',
        path: '/api/menus',
        query: {},
        body: { name: 'main', locale: 'en', label: 'Main' },
      },
      asAdmin,
    )
    const menu = (created.body as { data: SerialisedMenu }).data

    const taxonomyItem = await withTerms.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items`,
        query: {},
        body: {
          label: 'Category',
          kind: 'taxonomy',
          targetTaxonomy: 'topic',
          targetTermId: 'local-news',
        },
      },
      asAdmin,
    )
    expect(taxonomyItem.status).toBe(201)
    const resolvedTerm = (taxonomyItem.body as { data: SerialisedItem }).data
    expect(resolvedTerm.resolvedLabel).toBe('Local news')

    const homeItem = await withTerms.handle(
      {
        method: 'POST',
        path: `/api/menus/${menu.id}/items`,
        query: {},
        body: { label: 'Home', kind: 'home' },
      },
      asAdmin,
    )
    expect(homeItem.status).toBe(201)
    expect((homeItem.body as { data: SerialisedItem }).data.resolvedRoute).toBe('/')
  })

  describe('location (fiche 09, task 3)', () => {
    it('creates a menu with a location, and resolves it by-location', async () => {
      const created = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'main', locale: 'en', label: 'Main', location: 'primary' },
        },
        asAdmin,
      )
      expect(created.status).toBe(201)
      expect((created.body as { data: SerialisedMenu }).data.location).toBe('primary')

      const found = await router.handle(
        { method: 'GET', path: '/api/menus/by-location/primary', query: { locale: 'en' } },
        asPublic,
      )
      expect(found.status).toBe(200)
      expect((found.body as { data: SerialisedMenu }).data.name).toBe('main')
    })

    it('lets the admin change which menu holds a location, without touching the other menu', async () => {
      const current = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'main', locale: 'en', label: 'Main', location: 'primary' },
        },
        asAdmin,
      )
      const currentId = (current.body as { data: SerialisedMenu }).data.id
      const alt = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'alt', locale: 'en', label: 'Alt' },
        },
        asAdmin,
      )
      const altId = (alt.body as { data: SerialisedMenu }).data.id

      await router.handle(
        { method: 'PATCH', path: `/api/menus/${currentId}`, query: {}, body: { location: null } },
        asAdmin,
      )
      const promoted = await router.handle(
        { method: 'PATCH', path: `/api/menus/${altId}`, query: {}, body: { location: 'primary' } },
        asAdmin,
      )
      expect((promoted.body as { data: SerialisedMenu }).data.location).toBe('primary')

      const resolved = await router.handle(
        { method: 'GET', path: '/api/menus/by-location/primary', query: { locale: 'en' } },
        asPublic,
      )
      expect((resolved.body as { data: SerialisedMenu }).data.id).toBe(altId)
    })

    it('refuses assigning a location already taken, with a 4xx not a 500', async () => {
      await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'main', locale: 'en', label: 'Main', location: 'primary' },
        },
        asAdmin,
      )
      const clash = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'alt', locale: 'en', label: 'Alt', location: 'primary' },
        },
        asAdmin,
      )
      expect(clash.status).toBeGreaterThanOrEqual(400)
      expect(clash.status).toBeLessThan(500)
    })
  })

  describe('bulk reorder — PATCH /api/menus/{id}/items (task 2)', () => {
    async function menuWithThreeItems(): Promise<{
      readonly menuId: string
      readonly first: SerialisedItem
      readonly second: SerialisedItem
      readonly third: SerialisedItem
    }> {
      const created = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'main', locale: 'en', label: 'Main' },
        },
        asAdmin,
      )
      const menuId = (created.body as { data: SerialisedMenu }).data.id
      const items: SerialisedItem[] = []
      for (const label of ['A', 'B', 'C']) {
        const response = await router.handle(
          {
            method: 'POST',
            path: `/api/menus/${menuId}/items`,
            query: {},
            body: { label, kind: 'url', url: `/${label.toLowerCase()}` },
          },
          asAdmin,
        )
        items.push((response.body as { data: SerialisedItem }).data)
      }
      const [first, second, third] = items as [SerialisedItem, SerialisedItem, SerialisedItem]
      return { menuId, first, second, third }
    }

    it('rewrites the whole batch in one call, and the order tied is what a fresh read gives back', async () => {
      const { menuId, first, second, third } = await menuWithThreeItems()

      const reordered = await router.handle(
        {
          method: 'PATCH',
          path: `/api/menus/${menuId}/items`,
          query: {},
          body: {
            updates: [
              { id: third.id, parent: null, position: 0 },
              { id: first.id, parent: null, position: 1 },
              { id: second.id, parent: null, position: 2 },
            ],
          },
        },
        asAdmin,
      )
      expect(reordered.status).toBe(200)
      expect((reordered.body as { data: SerialisedItem[] }).data.map((item) => item.id)).toEqual([
        third.id,
        first.id,
        second.id,
      ])

      const reread = await router.handle(
        { method: 'GET', path: `/api/menus/${menuId}`, query: {} },
        asPublic,
      )
      const items = (reread.body as { data: { items: SerialisedItem[] } }).data.items
      expect(items.map((item) => item.id)).toEqual([third.id, first.id, second.id])
    })

    it('refuses the bulk reorder to a viewer', async () => {
      const { menuId, first } = await menuWithThreeItems()
      const refused = await router.handle(
        {
          method: 'PATCH',
          path: `/api/menus/${menuId}/items`,
          query: {},
          body: { updates: [{ id: first.id, parent: null, position: 0 }] },
        },
        asViewer,
      )
      expect(refused.status).toBe(403)
    })

    it('refuses a batch that names an item id from another menu', async () => {
      const { menuId } = await menuWithThreeItems()
      const otherMenu = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'other', locale: 'en', label: 'Other' },
        },
        asAdmin,
      )
      const otherMenuId = (otherMenu.body as { data: SerialisedMenu }).data.id
      const otherItem = await router.handle(
        {
          method: 'POST',
          path: `/api/menus/${otherMenuId}/items`,
          query: {},
          body: { label: 'Foreign', kind: 'url', url: '/foreign' },
        },
        asAdmin,
      )
      const foreignId = (otherItem.body as { data: SerialisedItem }).data.id

      const response = await router.handle(
        {
          method: 'PATCH',
          path: `/api/menus/${menuId}/items`,
          query: {},
          body: { updates: [{ id: foreignId, parent: null, position: 0 }] },
        },
        asAdmin,
      )
      expect(response.status).toBe(404)
    })
  })

  describe('health check (fiche 09, task 4)', () => {
    it('never sends resolvedHealth when the resolver does not compute one — no leak by default', async () => {
      const created = await router.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'main', locale: 'en', label: 'Main' },
        },
        asAdmin,
      )
      const menu = (created.body as { data: SerialisedMenu }).data
      const item = await router.handle(
        {
          method: 'POST',
          path: `/api/menus/${menu.id}/items`,
          query: {},
          body: { label: 'About', kind: 'entry', targetCollection: 'page', targetEntryId: 'known' },
        },
        asAdmin,
      )
      expect((item.body as { data: SerialisedItem }).data.resolvedHealth).toBeUndefined()
    })

    it('carries resolvedHealth through when the resolver reports one', async () => {
      const withHealth = createMenuRouter({
        store,
        resolveEntry: async () => ({ label: 'Draft page', route: null, health: 'draft' }),
      })
      const created = await withHealth.handle(
        {
          method: 'POST',
          path: '/api/menus',
          query: {},
          body: { name: 'main', locale: 'en', label: 'Main' },
        },
        asAdmin,
      )
      const menu = (created.body as { data: SerialisedMenu }).data
      const item = await withHealth.handle(
        {
          method: 'POST',
          path: `/api/menus/${menu.id}/items`,
          query: {},
          body: {
            label: 'About',
            kind: 'entry',
            targetCollection: 'page',
            targetEntryId: 'draft-1',
          },
        },
        asAdmin,
      )
      expect((item.body as { data: SerialisedItem }).data.resolvedHealth).toBe('draft')
    })
  })
})
