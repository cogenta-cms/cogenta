import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { defineTaxonomy } from '../../src/define-taxonomy.js'
import { f } from '../../src/fields.js'
import { createRolePermissionOverlay } from '../../src/store/role-permission-overlay.js'
import {
  createRolePermissionStore,
  type RolePermissionStore,
} from '../../src/store/role-permission-store.js'

const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: { title: f.text({ required: true }) },
  permissions: { read: ['public'], create: ['editor', 'admin'] },
})

const category = defineTaxonomy({
  name: 'category',
  labels: { singular: { en: 'Category' } },
  permissions: { read: ['public'] },
})

describe('createRolePermissionOverlay (sqlite)', () => {
  let directory: string
  let db: DatabaseHandle
  let store: RolePermissionStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-role-overlay-'))
    db = await createSqliteHandle({ url: join(directory, 'overlay.db') })
    store = createRolePermissionStore({ db, collections: [article], taxonomies: [category] })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('answers undefined for a target with no override — the caller must fall back to the file', async () => {
    const overlay = await createRolePermissionOverlay(store)
    expect(overlay.getCollectionRule('article', 'create')).toBeUndefined()
    expect(overlay.getTaxonomyRule('category', 'read')).toBeUndefined()
  })

  it('loads whatever the store already held at construction time', async () => {
    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'create',
      roles: ['author'],
      updatedBy: null,
    })

    const overlay = await createRolePermissionOverlay(store)
    expect(overlay.getCollectionRule('article', 'create')).toEqual({
      roles: ['author'],
      own: false,
    })
  })

  it('does not see a write made after construction until refresh() is called', async () => {
    const overlay = await createRolePermissionOverlay(store)
    expect(overlay.getCollectionRule('article', 'create')).toBeUndefined()

    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'create',
      roles: ['author'],
      updatedBy: null,
    })
    expect(overlay.getCollectionRule('article', 'create')).toBeUndefined()

    await overlay.refresh()
    expect(overlay.getCollectionRule('article', 'create')).toEqual({
      roles: ['author'],
      own: false,
    })
  })

  it('forgets a removed override on the next refresh', async () => {
    await store.set({
      targetType: 'taxonomy',
      targetName: 'category',
      action: 'read',
      roles: ['admin'],
      updatedBy: null,
    })
    const overlay = await createRolePermissionOverlay(store)
    expect(overlay.getTaxonomyRule('category', 'read')).toEqual({ roles: ['admin'], own: false })

    await store.remove('taxonomy', 'category', 'read')
    await overlay.refresh()
    expect(overlay.getTaxonomyRule('category', 'read')).toBeUndefined()
  })

  it('keeps collection and taxonomy overrides apart even when the names collide', async () => {
    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'read',
      roles: ['viewer'],
      updatedBy: null,
    })
    const overlay = await createRolePermissionOverlay(store)
    expect(overlay.getCollectionRule('article', 'read')).toEqual({ roles: ['viewer'], own: false })
    expect(overlay.getTaxonomyRule('article', 'read')).toBeUndefined()
  })
})
