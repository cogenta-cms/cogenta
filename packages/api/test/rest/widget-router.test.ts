import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createWidgetStore, ensureWidgetTables, STANDARD_WIDGET_AREAS } from '@cogenta/widgets'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestResponse } from '../../src/rest/http.js'
import { createWidgetRouter, type WidgetRouter } from '../../src/rest/widget-router.js'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/** The widget transport against a real SQLite database (L30), role by role. */

const asAdmin: AccessContext = { actor: { id: 'admin-1', roles: ['admin'] } }
const asEditor: AccessContext = { actor: { id: 'editor-1', roles: ['editor'] } }
const asPublic: AccessContext = { actor: ANONYMOUS }

type Json = { data?: Record<string, unknown> & { id?: string }; error?: { code: string } }

describe('createWidgetRouter', () => {
  let directory: string
  let db: DatabaseHandle
  let router: WidgetRouter
  let changes: number

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-widget-router-'))
    db = await createSqliteHandle({ url: join(directory, 'site.db') })
    await ensureWidgetTables(db)
    changes = 0
    router = createWidgetRouter({
      store: createWidgetStore({ db }),
      areas: async () => STANDARD_WIDGET_AREAS,
      onChange: () => {
        changes += 1
      },
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true, maxRetries: 5 })
  })

  const call = async (
    method: string,
    path: string,
    context: AccessContext,
    body?: unknown,
  ): Promise<RestResponse & { json: Json }> => {
    const response = await router.handle(
      { method, path, query: {}, ...(body === undefined ? {} : { body }) },
      context,
    )
    return { ...response, json: response.body as Json }
  }

  it('is admin-only on every method, reads included', async () => {
    expect((await call('GET', '/api/widgets', asEditor)).status).toBe(403)
    expect((await call('GET', '/api/widgets', asPublic)).status).toBe(403)
    expect(
      (await call('POST', '/api/widgets', asEditor, { area: 'sidebar', type: 'search' })).status,
    ).toBe(403)
    expect(changes).toBe(0)
  })

  it('lists the areas, the widgets and the types an admin can add', async () => {
    const response = await call('GET', '/api/widgets', asAdmin)
    expect(response.status).toBe(200)
    const data = response.json.data as { areas: { id: string }[]; types: string[] }
    expect(data.areas.map((area) => area.id)).toContain('sidebar')
    expect(data.types).toContain('recentEntries')
  })

  it('creates, edits, hides, moves, reorders, duplicates and deletes', async () => {
    const first = await call('POST', '/api/widgets', asAdmin, {
      area: 'sidebar',
      type: 'recentEntries',
      title: 'Latest',
      settings: { collection: 'article', count: 3 },
    })
    expect(first.status).toBe(201)
    const firstId = first.json.data?.id as string
    const second = await call('POST', '/api/widgets', asAdmin, { area: 'sidebar', type: 'search' })
    const secondId = second.json.data?.id as string

    const edited = await call('PATCH', `/api/widgets/${firstId}`, asAdmin, {
      enabled: false,
      title: 'Latest stories',
    })
    expect(edited.json.data).toMatchObject({
      enabled: false,
      title: 'Latest stories',
      updatedBy: 'admin-1',
    })

    const reordered = await call('PUT', '/api/widgets/areas/sidebar/order', asAdmin, {
      ids: [secondId, firstId],
    })
    expect((reordered.json.data as unknown as { id: string }[]).map((w) => w.id)).toEqual([
      secondId,
      firstId,
    ])

    const moved = await call('POST', `/api/widgets/${firstId}/move`, asAdmin, {
      area: 'footer-2',
      position: 0,
    })
    expect(moved.json.data).toMatchObject({ area: 'footer-2', position: 0 })

    const copy = await call('POST', `/api/widgets/${secondId}/duplicate`, asAdmin)
    expect(copy.status).toBe(201)
    expect(copy.json.data).toMatchObject({ enabled: false, type: 'search' })

    expect((await call('DELETE', `/api/widgets/${secondId}`, asAdmin)).status).toBe(204)
    expect((await call('GET', `/api/widgets/${secondId}`, asAdmin)).status).toBe(404)
    expect(changes).toBe(7)
  })

  it("answers a refused widget with 422 and the vocabulary's reason", async () => {
    const response = await call('POST', '/api/widgets', asAdmin, {
      area: 'sidebar',
      type: 'recentEntries',
      settings: { collection: 'article', count: 999 },
    })
    expect(response.status).toBe(422)
    expect(response.json.error?.code).toBe('WIDGET_INVALID')
    expect(
      (await call('POST', '/api/widgets', asAdmin, { area: 'sidebar', type: 'html' })).status,
    ).toBe(422)
    expect(changes).toBe(0)
  })

  // A widget in an area no theme declares is invisible for good: nothing
  // renders it, and the Widgets screen has no column to put it in. Both of
  // these used to succeed.
  it('refuses an area the active theme does not declare, on create and on move', async () => {
    const created = await call('POST', '/api/widgets', asAdmin, {
      area: 'nope',
      type: 'recentEntries',
      settings: { collection: 'article', count: 3 },
    })
    expect(created.status).toBe(422)
    expect(created.json.error?.code).toBe('WIDGET_INVALID')

    const real = await call('POST', '/api/widgets', asAdmin, {
      area: 'sidebar',
      type: 'recentEntries',
      settings: { collection: 'article', count: 3 },
    })
    expect(real.status).toBe(201)

    const moved = await call('POST', `/api/widgets/${real.json.data?.id}/move`, asAdmin, {
      area: 'nope',
      position: 0,
    })
    expect(moved.status).toBe(422)
  })

  // Answering 200 to a move that did not happen is worse than refusing it:
  // the caller believes the widget is somewhere it is not.
  it('refuses an area sent to the edit route, and names the one that moves a widget', async () => {
    const real = await call('POST', '/api/widgets', asAdmin, {
      area: 'sidebar',
      type: 'recentEntries',
      settings: { collection: 'article', count: 3 },
    })
    expect(real.status).toBe(201)

    const patched = await call('PATCH', `/api/widgets/${real.json.data?.id}`, asAdmin, {
      area: 'footer-1',
    })
    expect(patched.status).toBe(422)
    expect(JSON.stringify(patched.json)).toContain('/move')

    // And it really did not move.
    const reread = await call('GET', `/api/widgets/${real.json.data?.id}`, asAdmin)
    expect(reread.json.data?.['area']).toBe('sidebar')
  })

  it('answers an unknown widget with 404 and a wrong method with 405', async () => {
    expect(
      (
        await call('PATCH', '/api/widgets/0190c1a4-0000-7000-8000-000000000000', asAdmin, {
          enabled: true,
        })
      ).status,
    ).toBe(404)
    expect((await call('PUT', '/api/widgets', asAdmin)).status).toBe(405)
  })
})
