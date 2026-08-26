import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { f } from '../../src/fields.js'
import { createRolePermissionStore } from '../../src/store/role-permission-store.js'

/**
 * The race `RolePermissionStore.set()`'s delete-then-insert cannot avoid by
 * construction, played against two **real, independent connections to the
 * same database** (fiche 63, ADR-0028; `db-dialect-specialist`'s review).
 *
 * `set()` follows the same delete-then-insert shape `redirects.ts`'s
 * `performAdd` already documents choosing over a three-way-different upsert
 * statement (`ON CONFLICT` / `ON DUPLICATE KEY` / `INSERT OR REPLACE`), each
 * call wrapped in `db.transaction(..., { immediate: true })`. What a single
 * connection, or SQLite's own file lock, **cannot** demonstrate is what
 * `test/integration/routing.test.ts` already found for `NotFoundLogStore`:
 * "SQLite's `{ immediate: true }` masks that race entirely" — on SQLite a
 * second writer simply blocks until the first transaction commits, so this
 * exact shape can look safe there and still behave differently on
 * Postgres/MySQL, whose default isolation does not serialise two
 * transactions the way SQLite's single-writer file lock does.
 *
 * Two admins racing a PUT for the *same* `(targetType, targetName, action)`
 * triple is a real scenario (a slow double-click, two browser tabs) — this
 * suite proves what actually happens: never two surviving rows, never lost
 * data, and — the honest, currently-open question `BLOCKERS.md` names —
 * whether either writer ever throws a raw driver error instead of one
 * finishing after the other.
 */

export interface RolePermissionConcurrencyHarness {
  /** Two independent connections to the *same* server database. */
  readonly a: DatabaseHandle
  readonly b: DatabaseHandle
  dispose(): Promise<void>
}

export function runRolePermissionConcurrencyContract(
  label: string,
  create: () => Promise<RolePermissionConcurrencyHarness>,
): void {
  describe(`role permission override concurrency — ${label}`, () => {
    it('two connections racing set() on the same triple leave exactly one row, never zero, never two', async () => {
      const harness = await create()
      try {
        // A fresh, random collection name per run: this suite runs against a
        // real, persistent server database for Postgres/MySQL/MariaDB, so a
        // fixed name would collide with a row an earlier run left behind.
        const collectionName = `rpc_${randomUUID().replace(/-/gu, '_')}`
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

        const storeA = createRolePermissionStore({
          db: harness.a,
          collections: [article],
          taxonomies: [],
        })
        const storeB = createRolePermissionStore({
          db: harness.b,
          collections: [article],
          taxonomies: [],
        })

        // Both writers target the exact same triple, with different role
        // lists so the survivor is identifiable — whichever one "won" wrote
        // a real, complete row, not a merge of the two.
        const results = await Promise.allSettled([
          storeA.set({
            targetType: 'collection',
            targetName: collectionName,
            action: 'update',
            roles: ['editor-a'],
            updatedBy: 'writer-a',
          }),
          storeB.set({
            targetType: 'collection',
            targetName: collectionName,
            action: 'update',
            roles: ['editor-b'],
            updatedBy: 'writer-b',
          }),
        ])

        // Neither call is allowed to reject with a raw, unclassified driver
        // error (a bare unique-constraint violation bubbling past this
        // store's own API is exactly the failure mode a delete-then-insert
        // risks without a lock — see the module comment). A `CogentaError`
        // would be an acceptable, named refusal; an unrelated driver
        // exception is not.
        for (const result of results) {
          if (result.status === 'rejected') {
            throw new Error(
              `set() rejected with an unhandled error under a real two-connection race: ${String(result.reason)}`,
            )
          }
        }

        const rows = await storeA.list()
        expect(rows).toHaveLength(1)
        expect(['editor-a', 'editor-b']).toContain(rows[0]?.roles[0])
      } finally {
        await harness.dispose()
      }
    })
  })
}
