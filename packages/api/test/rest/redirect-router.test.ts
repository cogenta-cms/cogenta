import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createRedirectStore, type RedirectStore } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createRedirectRouter, type RedirectRouter } from '../../src/rest/redirect-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * The redirect transport, against a real SQLite database — never a mock
 * (AGENTS.md).
 *
 * Two things this suite exists to prove: every method is admin-only
 * (including `GET` — a redirect table is a routing decision, not content),
 * and the store's own loop/self-redirect refusal reaches a caller as a
 * proper HTTP error rather than a 500.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

interface Redirect {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: number
}

function request(
  method: string,
  extra: { readonly query?: RestRequest['query']; readonly body?: unknown } = {},
): RestRequest {
  return {
    method,
    path: '/api/redirects',
    query: extra.query ?? {},
    ...(extra.body === undefined ? {} : { body: extra.body }),
  }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

describe('the redirect transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: RedirectRouter
  let store: RedirectStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-redirect-api-'))
    db = await createSqliteHandle({ url: join(directory, 'redirects.db') })
    store = createRedirectStore({ db })
    router = createRedirectRouter({ store })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('permissions', () => {
    it('refuses an anonymous read', async () => {
      const response = await router.handle(request('GET'), asPublic)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor — this route is admin-only, unlike a menu or a taxonomy', async () => {
      const response = await router.handle(request('GET'), asEditor)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor trying to create one', async () => {
      const response = await router.handle(
        request('POST', { body: { from: '/old', to: '/new' } }),
        asEditor,
      )
      expect(response.status).toBe(403)
    })
  })

  describe('as an admin', () => {
    it('creates a redirect and lists it back', async () => {
      const created = await router.handle(
        request('POST', { body: { from: '/old-page', to: '/new-page' } }),
        asAdmin,
      )
      expect(created.status).toBe(201)
      const record = dataOf<Redirect>(created)
      expect(record.from).toBe('/old-page')
      expect(record.to).toBe('/new-page')
      expect(record.status).toBe(301)

      const listed = await router.handle(request('GET'), asAdmin)
      expect(listed.status).toBe(200)
      expect(dataOf<Redirect[]>(listed)).toHaveLength(1)
    })

    it('accepts an explicit 302 and reason', async () => {
      const created = await router.handle(
        request('POST', {
          body: { from: '/temp', to: '/elsewhere', status: 302, reason: 'manual' },
        }),
        asAdmin,
      )
      expect(created.status).toBe(201)
      expect(dataOf<Redirect>(created).status).toBe(302)
    })

    it('refuses a redirect to itself, as a 409 not a 500', async () => {
      const response = await router.handle(
        request('POST', { body: { from: '/same', to: '/same' } }),
        asAdmin,
      )
      expect(response.status).toBe(409)
      expect(errorOf(response).code).toBe('CONTENT_REDIRECT_LOOP')
    })

    it('refuses a loop across two rows, as a 409', async () => {
      await router.handle(request('POST', { body: { from: '/a', to: '/b' } }), asAdmin)
      const response = await router.handle(
        request('POST', { body: { from: '/b', to: '/a' } }),
        asAdmin,
      )
      expect(response.status).toBe(409)
      expect(errorOf(response).code).toBe('CONTENT_REDIRECT_LOOP')
    })

    it('rejects a body missing "to"', async () => {
      const response = await router.handle(request('POST', { body: { from: '/old' } }), asAdmin)
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('CONTENT_ROUTE_INVALID')
    })

    it('removes a redirect by its "from" query parameter', async () => {
      await router.handle(request('POST', { body: { from: '/gone', to: '/here' } }), asAdmin)

      const removed = await router.handle(request('DELETE', { query: { from: '/gone' } }), asAdmin)
      expect(removed.status).toBe(204)

      const listed = await router.handle(request('GET'), asAdmin)
      expect(dataOf<Redirect[]>(listed)).toHaveLength(0)
    })

    it('answers 404 removing a redirect that does not exist', async () => {
      const response = await router.handle(
        request('DELETE', { query: { from: '/never-existed' } }),
        asAdmin,
      )
      expect(response.status).toBe(404)
      expect(errorOf(response).code).toBe('REDIRECT_UNKNOWN')
    })

    it('requires "from" on delete', async () => {
      const response = await router.handle(request('DELETE'), asAdmin)
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('QUERY_INVALID')
    })
  })
})
