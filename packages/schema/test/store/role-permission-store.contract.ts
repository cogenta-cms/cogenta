import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { f } from '../../src/fields.js'
import {
  createRolePermissionStore,
  type RolePermissionStore,
} from '../../src/store/role-permission-store.js'

/**
 * The single contract suite for role permission overrides (fiche 63,
 * ADR-0028), played against every dialect — SQLite as a real unit test
 * (`role-permission-store.test.ts`, the fuller suite) and
 * Postgres/MySQL/MariaDB here as integration tests when the services are up.
 *
 * What actually needs proving on all three dialects, rather than assumed
 * from SQLite: the `boolean` `own` column round-trips correctly (Postgres
 * has a real `boolean`; MySQL/MariaDB use `tinyint`; SQLite uses `integer` —
 * three different physical types behind one logical value), and the
 * delete-then-insert `set()` performs inside its own transaction on every
 * dialect (never leaves two rows, or zero, for the same triple).
 *
 * A fresh, random collection name per run: this suite runs against a real,
 * persistent server database for Postgres/MySQL/MariaDB, so a fixed name
 * would collide with a row an earlier run left behind — a random name is
 * what lets the same test file mean the same thing whether the database is
 * a throwaway SQLite file or a persistent server that outlives this run.
 */

export interface RolePermissionHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

export function runRolePermissionStoreContract(
  label: string,
  create: () => Promise<RolePermissionHarness>,
): void {
  describe(`role permission override contract — ${label}`, () => {
    let harness: RolePermissionHarness | undefined

    afterEach(async () => {
      await harness?.db.close()
      await harness?.dispose?.()
      harness = undefined
    })

    async function storeFor(): Promise<{
      readonly store: RolePermissionStore
      readonly collectionName: string
    }> {
      harness = await create()
      const collectionName = `rp_${randomUUID().replace(/-/gu, '_')}`
      const article = defineCollection({
        name: collectionName,
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
      const store = createRolePermissionStore({
        db: (harness as RolePermissionHarness).db,
        collections: [article],
        taxonomies: [],
      })
      return { store, collectionName }
    }

    it('writes a row and lists it back, roles and own both intact', async () => {
      const { store, collectionName } = await storeFor()
      const record = await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'update',
        roles: ['author', 'editor'],
        own: true,
        updatedBy: 'user-1',
      })
      expect(record.roles).toEqual(['author', 'editor'])
      expect(record.own).toBe(true)

      const rows = await store.list()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.own).toBe(true)
      expect(rows[0]?.roles).toEqual(['author', 'editor'])
    })

    it('an own:false row round-trips as false, not merely falsy', async () => {
      const { store, collectionName } = await storeFor()
      await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'create',
        roles: ['editor'],
        own: false,
        updatedBy: null,
      })
      const [row] = await store.list()
      expect(row?.own).toStrictEqual(false)
    })

    it('overwrites the same (target, action) triple in place — never two rows', async () => {
      const { store, collectionName } = await storeFor()
      await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'delete',
        roles: ['admin'],
        updatedBy: null,
      })
      await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'delete',
        roles: ['admin', 'editor'],
        updatedBy: null,
      })

      const rows = await store.list()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.roles).toEqual(['admin', 'editor'])
    })

    it('a triple written on one action leaves a different action untouched', async () => {
      const { store, collectionName } = await storeFor()
      await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'read',
        roles: ['public'],
        updatedBy: null,
      })
      await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'update',
        roles: ['editor'],
        updatedBy: null,
      })

      const rows = await store.list()
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.action).sort()).toEqual(['read', 'update'])
    })

    it('removes exactly the row it names, reporting whether one existed', async () => {
      const { store, collectionName } = await storeFor()
      await store.set({
        targetType: 'collection',
        targetName: collectionName,
        action: 'publish',
        roles: ['admin'],
        updatedBy: null,
      })

      expect(await store.remove('collection', collectionName, 'publish')).toBe(true)
      expect(await store.list()).toEqual([])
      expect(await store.remove('collection', collectionName, 'publish')).toBe(false)
    })
  })
}
