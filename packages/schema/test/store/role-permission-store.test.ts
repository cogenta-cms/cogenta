import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, isCogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { defineTaxonomy } from '../../src/define-taxonomy.js'
import { f } from '../../src/fields.js'
import {
  createRolePermissionStore,
  type RolePermissionStore,
} from '../../src/store/role-permission-store.js'
import type { CollectionDefinition, ContentAction, TaxonomyDefinition } from '../../src/types.js'
import { runRolePermissionConcurrencyContract } from './role-permission-concurrency.contract.js'
import { runRolePermissionStoreContract } from './role-permission-store.contract.js'

/** Widens a string past the `ContentAction` union to exercise the store's runtime guard directly, without `any`. */
function asAction(value: string): ContentAction {
  return value as unknown as ContentAction
}

/**
 * Fiche 63, ADR-0028. Every test in this file exercises the write door a
 * database-backed permission override actually goes through — the same
 * `defineCollection`/`defineTaxonomy` validation `cogenta.schema.*` itself
 * is checked by (task 4: "ne pas dupliquer une seconde logique de
 * validation").
 */

const article: CollectionDefinition = defineCollection({
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

const category: TaxonomyDefinition = defineTaxonomy({
  name: 'category',
  labels: { singular: { en: 'Category' } },
  permissions: { read: ['public'], create: ['editor'] },
})

describe('createRolePermissionStore (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: RolePermissionStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-role-permissions-'))
    db = await createSqliteHandle({ url: join(directory, 'role-permissions.db') })
    store = createRolePermissionStore({ db, collections: [article], taxonomies: [category] })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('starts with no override at all', async () => {
    expect(await store.list()).toEqual([])
  })

  it('writes a collection override and reads it back', async () => {
    const record = await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'create',
      roles: ['author'],
      updatedBy: 'user-1',
    })

    expect(record.roles).toEqual(['author'])
    expect(record.own).toBe(false)
    expect(record.updatedBy).toBe('user-1')

    const [only] = await store.list()
    expect(only?.targetName).toBe('article')
    expect(only?.action).toBe('create')
    expect(only?.roles).toEqual(['author'])
  })

  it('carries "own" for a collection action, defaulting to false', async () => {
    const record = await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'update',
      roles: ['contributor'],
      own: true,
      updatedBy: null,
    })
    expect(record.own).toBe(true)
  })

  it('overwrites the same (target, action) triple in place, never appending', async () => {
    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'delete',
      roles: ['admin'],
      updatedBy: null,
    })
    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'delete',
      roles: ['admin', 'editor'],
      updatedBy: null,
    })

    const rows = await store.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.roles).toEqual(['admin', 'editor'])
  })

  it('writes an explicit empty-roles override — nobody may do this, and it is still an override', async () => {
    const record = await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'publish',
      roles: [],
      updatedBy: null,
    })
    expect(record.roles).toEqual([])
    expect(await store.list()).toHaveLength(1)
  })

  it('writes a taxonomy override', async () => {
    const record = await store.set({
      targetType: 'taxonomy',
      targetName: 'category',
      action: 'create',
      roles: ['admin'],
      updatedBy: null,
    })
    expect(record.targetType).toBe('taxonomy')
    expect(record.roles).toEqual(['admin'])
  })

  it('reuses defineCollection validation: refuses an unknown action', async () => {
    await expect(
      store.set({
        targetType: 'collection',
        targetName: 'article',
        action: asAction('archive'),
        roles: ['admin'],
        updatedBy: null,
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' })
  })

  it('reuses defineCollection validation: refuses an empty role name', async () => {
    await expect(
      store.set({
        targetType: 'collection',
        targetName: 'article',
        action: 'read',
        roles: [''],
        updatedBy: null,
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' })
  })

  it('refuses a target this site never declared', async () => {
    const error = await store
      .set({
        targetType: 'collection',
        targetName: 'ghost',
        action: 'read',
        roles: ['public'],
        updatedBy: null,
      })
      .catch((caught: unknown) => caught)

    expect(isCogentaError(error) && error.code).toBe('ROLE_PERMISSION_TARGET_UNKNOWN')
  })

  it('refuses "own" on a taxonomy — a term has no author', async () => {
    const error = await store
      .set({
        targetType: 'taxonomy',
        targetName: 'category',
        action: 'update',
        roles: ['editor'],
        own: true,
        updatedBy: null,
      })
      .catch((caught: unknown) => caught)

    expect(isCogentaError(error) && error.code).toBe('ROLE_PERMISSION_INVALID')
    expect(await store.list()).toEqual([])
  })

  it('refuses "publish" on a taxonomy the same way defineTaxonomy always has', async () => {
    await expect(
      store.set({
        targetType: 'taxonomy',
        targetName: 'category',
        action: 'publish',
        roles: ['admin'],
        updatedBy: null,
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' })
  })

  it('removes an override — the target falls back to the file on the next read', async () => {
    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'read',
      roles: ['admin'],
      updatedBy: null,
    })

    expect(await store.remove('collection', 'article', 'read')).toBe(true)
    expect(await store.list()).toEqual([])
    // Removing again is a no-op, reported honestly rather than throwing.
    expect(await store.remove('collection', 'article', 'read')).toBe(false)
  })
})

/**
 * The same contract Postgres/MySQL/MariaDB run in
 * `test/integration/role-permission-store.test.ts` — SQLite is the degraded
 * driver every shared-hosting install falls back to, so it runs the
 * dialect-sensitive contract too, not just the bespoke tests above.
 */
runRolePermissionStoreContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-role-permissions-contract-'))
  return {
    db: await createSqliteHandle({ url: join(directory, 'role-permissions.db') }),
    dispose: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
})

/**
 * The concurrency race, on SQLite: a **file**, not `:memory:` (two in-memory
 * handles are two unrelated databases — nothing can race against itself
 * there), with two real connections to it. What this run can prove is
 * narrower than the integration run's promise — see the module comment on
 * `role-permission-concurrency.contract.ts` for why SQLite's own file lock
 * can mask a race Postgres/MySQL would not.
 */
runRolePermissionConcurrencyContract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-role-permissions-race-'))
  const path = join(directory, 'race.db')
  const a = await createSqliteHandle({ url: path })
  const b = await createSqliteHandle({ url: path })
  return {
    a,
    b,
    dispose: async () => {
      await a.close()
      await b.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
})
