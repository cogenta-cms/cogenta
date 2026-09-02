import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * Fiche 35 audit T03 — `CONTENT_STALE_WRITE` (`store.ts:1216-1240`) has been
 * in production since fiche 02 task 7 with no test proving it, at the store
 * layer, ever actually fires — or that a caller who never sends
 * `expectedUpdatedAt` still writes exactly as before (R2's own discipline
 * applied to an old client rather than a missing provider).
 */

const note: CollectionDefinition = {
  name: 'stale_write_note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

describe('CONTENT_STALE_WRITE', () => {
  let directory: string
  let db: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-stale-write-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [note])
  })

  afterEach(async () => {
    await dropSchemaTables(db, [note])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses a write whose expectedUpdatedAt no longer matches, naming both timestamps', async () => {
    const store = createContentStore({ db, collection: note })
    const created = await store.create({ status: 'draft', values: { title: 'First' } })
    const loadedUpdatedAt = created.updatedAt

    // A second editor's write lands first — this is exactly what the first
    // editor's stale `expectedUpdatedAt` must now disagree with.
    const concurrent = await store.update(created.id, {
      values: { title: 'Changed by someone else' },
    })
    expect(concurrent.updatedAt).not.toBe(loadedUpdatedAt)

    await expect(
      store.update(created.id, {
        values: { title: 'My own, now stale, edit' },
        expectedUpdatedAt: loadedUpdatedAt,
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_STALE_WRITE',
      details: {
        collection: note.name,
        id: created.id,
        expected: loadedUpdatedAt,
        actual: concurrent.updatedAt,
      },
    })

    // The refusal must be real, not cosmetic: the concurrent write is still
    // the one that landed.
    const current = await store.read(created.id, { state: 'working' })
    expect(current?.values.title).toBe('Changed by someone else')
  })

  it('a caller that never sends expectedUpdatedAt still overwrites, unguarded — the optional field regresses nothing', async () => {
    const store = createContentStore({ db, collection: note })
    const created = await store.create({ status: 'draft', values: { title: 'First' } })
    await store.update(created.id, { values: { title: 'Changed by someone else' } })

    // The same scenario `CONTENT_STALE_WRITE` refuses above, but without
    // `expectedUpdatedAt` at all — an old client, or a caller that never
    // asked for the guard, still writes exactly as it always could (R2: the
    // feature is additive, never a new requirement sprung on an existing
    // caller).
    const result = await store.update(created.id, {
      values: { title: 'Overwrites without complaint' },
    })
    expect(result.values.title).toBe('Overwrites without complaint')
  })
})
