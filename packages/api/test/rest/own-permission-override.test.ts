import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  type RolePermissionOverrides,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import { createContentService } from '../../src/rest/content-service.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createRestRouter, type RestRouter } from '../../src/rest/router.js'
import type { Actor } from '../../src/types.js'

/**
 * Regression coverage for a real bug `contract-guardian` found while
 * reviewing fiche 63 (ADR-0028): `content-service.ts`'s `assertOwnAware`
 * used to read `target.permissions[action]` directly — the file only —
 * to decide whether an action needs the entry's owner. A database override
 * adding `own: true` to an action the file never marked that way went
 * unseen, so `assertOwnAware` never fetched the owner, and
 * `PermissionLayer.can()` then refused even the entry's own author (an
 * `own: true` rule with no `ownerId` never matches). Fixed by having
 * `assertOwnAware` ask `PermissionLayer.ruleFor()` — the *effective* rule —
 * instead of reading the file directly.
 */

const NOTE: CollectionDefinition = {
  name: 'own_override_note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  // The file never declares `own` on `update` — only a database override does.
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
}

const AUTHOR_EDITOR: Actor = { id: 'user-editor-author', roles: ['editor'] }
const OTHER_EDITOR: Actor = { id: 'user-editor-other', roles: ['editor'] }

function overridesFrom(
  rules: Readonly<Record<string, { readonly roles: readonly string[]; readonly own?: boolean }>>,
): RolePermissionOverrides {
  return {
    getCollectionRule: (collection, action) => {
      const rule = rules[`${collection}:${action}`]
      return rule === undefined ? undefined : { roles: rule.roles, own: rule.own ?? false }
    },
    getTaxonomyRule: () => undefined,
  }
}

function request(method: string, path: string, body?: unknown): RestRequest {
  return { method, path: `/api/content${path}`, query: {}, ...(body === undefined ? {} : { body }) }
}

function dataOf(response: RestResponse): Record<string, unknown> {
  const body = response.body as { data?: Record<string, unknown> } | null
  return body?.data ?? {}
}

describe('an "own" override actually protects — and does not lock out — the entry owner', () => {
  let db: DatabaseHandle
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-own-override-'))
    db = await createSqliteHandle({ url: join(directory, 'own.db') })
    await createSchemaTables(db, [NOTE])
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  function routerWith(overrides?: RolePermissionOverrides): RestRouter {
    const store = createContentStore({ db, collection: NOTE, siblings: [NOTE] })
    const service = createContentService({
      collections: [NOTE],
      permissions: createPermissionLayer({
        collections: [NOTE],
        ...(overrides === undefined ? {} : { rolePermissionOverrides: overrides }),
      }),
      storeFor: () => store,
    })
    return createRestRouter({ service })
  }

  it('without an override, the file alone lets any editor update — no owner check at all', async () => {
    const router = routerWith()
    const created = await router.handle(
      request('POST', '/own_override_note', { values: { title: 'Mine' } }),
      { actor: AUTHOR_EDITOR },
    )
    const id = String(dataOf(created)['id'])

    const updatedByOther = await router.handle(
      request('PATCH', `/own_override_note/${id}`, { values: { title: 'Edited by someone else' } }),
      { actor: OTHER_EDITOR },
    )
    expect(updatedByOther.status).toBe(200)
  })

  it('a database override adding own:true is actually enforced — a non-owner is refused', async () => {
    const router = routerWith(
      overridesFrom({ 'own_override_note:update': { roles: ['editor'], own: true } }),
    )
    const created = await router.handle(
      request('POST', '/own_override_note', { values: { title: 'Mine' } }),
      { actor: AUTHOR_EDITOR },
    )
    const id = String(dataOf(created)['id'])

    const updatedByOther = await router.handle(
      request('PATCH', `/own_override_note/${id}`, { values: { title: 'Edited by someone else' } }),
      { actor: OTHER_EDITOR },
    )
    expect(updatedByOther.status).toBe(403)
  })

  it("the same override does NOT lock out the entry's own author — the regression this test guards against", async () => {
    const router = routerWith(
      overridesFrom({ 'own_override_note:update': { roles: ['editor'], own: true } }),
    )
    const created = await router.handle(
      request('POST', '/own_override_note', { values: { title: 'Mine' } }),
      { actor: AUTHOR_EDITOR },
    )
    const id = String(dataOf(created)['id'])

    const updatedByAuthor = await router.handle(
      request('PATCH', `/own_override_note/${id}`, {
        values: { title: 'Edited by its own author' },
      }),
      { actor: AUTHOR_EDITOR },
    )
    expect(updatedByAuthor.status).toBe(200)
  })
})
