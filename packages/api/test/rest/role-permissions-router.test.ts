import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createRolePermissionOverlay,
  createRolePermissionStore,
  defineCollection,
  defineTaxonomy,
  f,
  type RolePermissionOverlay,
  type RolePermissionStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import {
  createRolePermissionRouter,
  type RolePermissionRouter,
} from '../../src/rest/role-permissions-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `/api/role-permissions` (fiche 63, ADR-0028) against a real SQLite
 * database — never a mock (AGENTS.md). R4: every route tested per role,
 * including that a successful write actually reaches `list()` afterward and
 * that `overlay.refresh()` is called so the effective decision changes
 * without a restart.
 */

const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: { title: f.text({ required: true }) },
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

const category = defineTaxonomy({
  name: 'category',
  labels: { singular: { en: 'Category' } },
  permissions: { read: ['public'], create: ['editor'] },
})

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

function request(
  method: string,
  extra: { readonly path?: string; readonly body?: unknown } = {},
): RestRequest {
  return {
    method,
    path: extra.path ?? '/api/role-permissions',
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

describe('the role permission override transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: RolePermissionRouter
  let store: RolePermissionStore
  let overlay: RolePermissionOverlay

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-role-permissions-api-'))
    db = await createSqliteHandle({ url: join(directory, 'role-permissions.db') })
    store = createRolePermissionStore({ db, collections: [article], taxonomies: [category] })
    overlay = await createRolePermissionOverlay(store)
    router = createRolePermissionRouter({ store, overlay })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('permissions (R4: every route, per role)', () => {
    it('refuses an anonymous GET', async () => {
      const response = await router.handle(request('GET'), asPublic)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor GET — this is not a general authoring permission', async () => {
      const response = await router.handle(request('GET'), asEditor)
      expect(response.status).toBe(403)
    })

    it('refuses an editor PUT', async () => {
      const response = await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'article',
            action: 'create',
            roles: ['admin'],
          },
        }),
        asEditor,
      )
      expect(response.status).toBe(403)
    })

    it('refuses an anonymous PUT', async () => {
      const response = await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'article',
            action: 'create',
            roles: ['admin'],
          },
        }),
        asPublic,
      )
      expect(response.status).toBe(403)
    })

    it('refuses an editor DELETE', async () => {
      const response = await router.handle(
        request('DELETE', { path: '/api/role-permissions/collection/article/create' }),
        asEditor,
      )
      expect(response.status).toBe(403)
    })

    it('lets admin GET, PUT and DELETE', async () => {
      expect((await router.handle(request('GET'), asAdmin)).status).toBe(200)
      const put = await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'article',
            action: 'create',
            roles: ['author'],
          },
        }),
        asAdmin,
      )
      expect(put.status).toBe(200)
      const del = await router.handle(
        request('DELETE', { path: '/api/role-permissions/collection/article/create' }),
        asAdmin,
      )
      expect(del.status).toBe(200)
    })
  })

  describe('reads and writes', () => {
    it('starts empty', async () => {
      const response = await router.handle(request('GET'), asAdmin)
      expect(dataOf<readonly unknown[]>(response)).toEqual([])
    })

    it('writes an override and lists it back', async () => {
      const put = await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'article',
            // "own" only has meaning on update/delete — a brand new entry
            // has no owner to compare against yet (defineCollection's own
            // rule, reused unmodified by the store).
            action: 'update',
            roles: ['author'],
            own: true,
          },
        }),
        asAdmin,
      )
      expect(put.status).toBe(200)
      const record = dataOf<{ roles: readonly string[]; own: boolean }>(put)
      expect(record.roles).toEqual(['author'])
      expect(record.own).toBe(true)

      const list = dataOf<readonly unknown[]>(await router.handle(request('GET'), asAdmin))
      expect(list).toHaveLength(1)
    })

    it('refreshes the overlay after a write — R4: the effective decision changes without a restart', async () => {
      expect(overlay.getCollectionRule('article', 'create')).toBeUndefined()

      await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'article',
            action: 'create',
            roles: ['author'],
          },
        }),
        asAdmin,
      )

      expect(overlay.getCollectionRule('article', 'create')).toEqual({
        roles: ['author'],
        own: false,
      })
    })

    it('refreshes the overlay after a delete too', async () => {
      await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'article',
            action: 'create',
            roles: ['author'],
          },
        }),
        asAdmin,
      )
      expect(overlay.getCollectionRule('article', 'create')).not.toBeUndefined()

      await router.handle(
        request('DELETE', { path: '/api/role-permissions/collection/article/create' }),
        asAdmin,
      )
      expect(overlay.getCollectionRule('article', 'create')).toBeUndefined()
    })

    it('does not refresh the overlay when there was nothing to delete', async () => {
      const response = await router.handle(
        request('DELETE', { path: '/api/role-permissions/collection/article/create' }),
        asAdmin,
      )
      expect(dataOf<{ removed: boolean }>(response).removed).toBe(false)
    })

    it('reuses the same validation as defineCollection — an unknown collection is refused', async () => {
      const response = await router.handle(
        request('PUT', {
          body: {
            targetType: 'collection',
            targetName: 'ghost',
            action: 'read',
            roles: ['public'],
          },
        }),
        asAdmin,
      )
      expect(response.status).toBe(404)
      expect(errorOf(response).code).toBe('ROLE_PERMISSION_TARGET_UNKNOWN')
    })

    it('refuses a malformed body before it ever reaches the store', async () => {
      const response = await router.handle(
        request('PUT', { body: { targetType: 'collection', targetName: 'article' } }),
        asAdmin,
      )
      expect(response.status).toBe(400)
    })

    it('writes a taxonomy override', async () => {
      const response = await router.handle(
        request('PUT', {
          body: {
            targetType: 'taxonomy',
            targetName: 'category',
            action: 'create',
            roles: ['admin'],
          },
        }),
        asAdmin,
      )
      expect(response.status).toBe(200)
      expect(overlay.getTaxonomyRule('category', 'create')).toEqual({
        roles: ['admin'],
        own: false,
      })
    })
  })
})
