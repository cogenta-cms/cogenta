import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { entriesTable } from '../../src/store/naming.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * Fiche 28 task 4's concurrency requirement, copying the exact model the lot
 * names: `packages/commerce/test/stock-concurrency.test.ts`. Two things make
 * this a real test rather than a hopeful one — a **file**, not `:memory:` (two
 * in-memory handles are two unrelated databases, so racing against them would
 * prove nothing), and a **naive control** that reimplements the wrong version
 * — read the status, decide, then write — against the same two connections
 * and shows it really does publish twice. Without the control, a green result
 * would be equally consistent with "the guard works" and with "the test never
 * actually raced anything".
 */

const page: CollectionDefinition = {
  name: 'sched_page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    publishedAt: { kind: 'datetime', options: {} },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['admin'] },
}

interface FileDb {
  readonly db: DatabaseHandle
  readonly path: string
  dispose(): Promise<void>
}

async function testFileDb(): Promise<FileDb> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-scheduler-'))
  const path = join(directory, 'site.db')
  const db = await createSqliteHandle({ url: path })
  await createSchemaTables(db, [page])

  return {
    db,
    path,
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

describe('claiming a scheduled publish under real concurrency', () => {
  let fixture: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (fixture !== undefined) await fixture.dispose()
    second = undefined
    fixture = undefined
  })

  it('publishes exactly once when two processes race the same entry', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const writer = createContentStore({ db: fixture.db, collection: page })
    const entry = await writer.create({ values: { title: 'Midnight release' } })
    await writer.unpublish(entry.id, {
      status: 'scheduled',
      publishedAt: new Date(Date.now() - 1000),
    })

    // Two independent connections, standing in for two server processes both
    // draining the same due job at once.
    const processA = createContentStore({ db: fixture.db, collection: page })
    const processB = createContentStore({ db: second, collection: page })

    const [claimedByA, claimedByB] = await Promise.all([
      processA.claimForScheduledPublish(entry.id),
      processB.claimForScheduledPublish(entry.id),
    ])

    const winners = [claimedByA, claimedByB].filter((result) => result !== null)
    expect(winners).toHaveLength(1)

    const after = await writer.read(entry.id)
    expect(after?.status).toBe('published')
  })

  it('holds under twenty simultaneous claimants for one entry', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const writer = createContentStore({ db: fixture.db, collection: page })
    const entry = await writer.create({ values: { title: 'Contested' } })
    await writer.unpublish(entry.id, {
      status: 'scheduled',
      publishedAt: new Date(Date.now() - 1000),
    })

    const claimants = Array.from({ length: 20 }, (_unused, index) =>
      createContentStore({
        db: index % 2 === 0 ? (fixture as FileDb).db : (second as DatabaseHandle),
        collection: page,
      }),
    )

    const results = await Promise.all(
      claimants.map((claimant) => claimant.claimForScheduledPublish(entry.id)),
    )

    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect((await writer.read(entry.id))?.status).toBe('published')
  })

  it('the naive read-then-write it replaces really does publish twice', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const writer = createContentStore({ db: fixture.db, collection: page })
    const entry = await writer.create({ values: { title: 'Control' } })
    await writer.unpublish(entry.id, {
      status: 'scheduled',
      publishedAt: new Date(Date.now() - 1000),
    })

    const entries = identifier(entriesTable(page.name), 'sqlite')

    /** Read the status, decide in JavaScript, then write. The wrong version. */
    const naiveClaim = async (handle: DatabaseHandle): Promise<boolean> => {
      const read = await handle.query<{ status: string }>(
        sql`select status from ${entries} where id = ${entry.id}`,
      )
      const status = read.rows[0]?.status
      // The gap. Both callers are here at the same time, both saw "scheduled".
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (status !== 'scheduled') return false
      await handle.query(sql`update ${entries} set status = ${'published'} where id = ${entry.id}`)
      return true
    }

    const results = await Promise.all([naiveClaim(fixture.db), naiveClaim(second)])

    // Both "succeeded" — one scheduled entry, published twice over. This is
    // the bug `claimForScheduledPublish`'s guarded `UPDATE` exists to
    // prevent, demonstrated rather than described.
    expect(results).toEqual([true, true])
  })
})
