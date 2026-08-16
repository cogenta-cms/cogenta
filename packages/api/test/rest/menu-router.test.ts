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
}

interface SerialisedItem {
  readonly id: string
  readonly kind: string
  readonly resolvedLabel?: string
  readonly resolvedRoute?: string | null
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
})
