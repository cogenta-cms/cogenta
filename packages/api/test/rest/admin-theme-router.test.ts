import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { type AdminThemeStore, createAdminThemeStore, ensureAdminThemeTable } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AdminThemeRouter, createAdminThemeRouter } from '../../src/rest/admin-theme-router.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * The `/api/admin-theme` transport (L21 task 2), against a real SQLite
 * database. What this suite exists to prove: a read never needs a session
 * (the login screen paints in the chosen template before one exists), a
 * write needs `admin` specifically (not merely a session), an unknown
 * template or an override the schema does not declare is refused rather
 * than silently accepted, and the response always names both built-in
 * templates so the gallery never needs a second request.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

function request(method: string, extra: { readonly body?: unknown } = {}): RestRequest {
  return {
    method,
    path: '/api/admin-theme',
    query: {},
    ...(extra.body === undefined ? {} : { body: extra.body }),
  }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

describe('the admin theme transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: AdminThemeRouter
  let store: AdminThemeStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-admin-theme-api-'))
    db = await createSqliteHandle({ url: join(directory, 'admin-theme.db') })
    await ensureAdminThemeTable(db)
    store = createAdminThemeStore({ db })
    router = createAdminThemeRouter({ store })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('reading', () => {
    it('is public — no session, unlike almost every other admin-only screen', async () => {
      const response = await router.handle(request('GET'), asPublic)
      expect(response.status).toBe(200)
    })

    it('answers the default template before anybody has ever written a choice', async () => {
      const response = await router.handle(request('GET'), asPublic)
      const data = dataOf<{ active: { templateId: string; overrides: unknown } }>(response)
      expect(data.active.templateId).toBe('nightops')
      expect(data.active.overrides).toEqual({})
    })

    it('always names both built-in templates alongside the active choice', async () => {
      const response = await router.handle(request('GET'), asPublic)
      const data = dataOf<{ templates: readonly { id: string }[] }>(response)
      expect(data.templates.map((template) => template.id).sort()).toEqual(['atelier', 'nightops'])
    })
  })

  describe('writing', () => {
    it('refuses an anonymous write', async () => {
      const response = await router.handle(
        request('PUT', { body: { templateId: 'atelier', overrides: {} } }),
        asPublic,
      )
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses a signed-in write from a non-admin role', async () => {
      const response = await router.handle(
        request('PUT', { body: { templateId: 'atelier', overrides: {} } }),
        asEditor,
      )
      expect(response.status).toBe(403)
    })

    it('lets admin choose a template and personalise it, and the choice sticks', async () => {
      const response = await router.handle(
        request('PUT', {
          body: { templateId: 'atelier', overrides: { primaryColor: '#c23d0a' } },
        }),
        asAdmin,
      )
      expect(response.status).toBe(200)
      expect(dataOf<{ active: { templateId: string } }>(response).active.templateId).toBe('atelier')

      const read = await router.handle(request('GET'), asPublic)
      const data = dataOf<{ active: { templateId: string; overrides: { primaryColor?: string } } }>(
        read,
      )
      expect(data.active.templateId).toBe('atelier')
      expect(data.active.overrides.primaryColor).toBe('#c23d0a')
    })

    it('refuses an unknown template id', async () => {
      const response = await router.handle(
        request('PUT', { body: { templateId: 'midnight-neon', overrides: {} } }),
        asAdmin,
      )
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('ADMIN_THEME_TEMPLATE_UNKNOWN')
    })

    it('refuses an override the schema does not declare', async () => {
      const response = await router.handle(
        request('PUT', { body: { templateId: 'nightops', overrides: { headerHeightPx: 64 } } }),
        asAdmin,
      )
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('ADMIN_THEME_INVALID')
    })

    it('requires a templateId in the body', async () => {
      const response = await router.handle(request('PUT', { body: {} }), asAdmin)
      expect(response.status).toBe(400)
    })
  })

  it('answers 405 for a method neither GET nor PUT', async () => {
    const response = await router.handle(request('DELETE'), asAdmin)
    expect(response.status).toBe(405)
  })

  it('answers 404 off its own mount path', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/something-else', query: {} },
      asPublic,
    )
    expect(response.status).toBe(404)
  })
})
