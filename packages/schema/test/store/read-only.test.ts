import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withReadOnlyStore } from '../../src/store/read-only.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

const tag: CollectionDefinition = {
  name: 'read_only_tag',
  labels: { singular: 'Tag', plural: 'Tags' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

describe('withReadOnlyStore', () => {
  let directory: string
  let db: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-readonly-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [tag])
  })

  afterEach(async () => {
    await dropSchemaTables(db, [tag])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses every mutating call with CONTENT_READ_ONLY, real writes never land', async () => {
    const writable = createContentStore({ db, collection: tag })
    const seeded = await writable.create({ status: 'published', values: { title: 'Real' } })

    const readOnly = withReadOnlyStore(writable)

    await expect(
      readOnly.create({ status: 'published', values: { title: 'Blocked' } }),
    ).rejects.toMatchObject({ code: 'CONTENT_READ_ONLY' })
    await expect(
      readOnly.update(seeded.id, { values: { title: 'Blocked' } }),
    ).rejects.toMatchObject({ code: 'CONTENT_READ_ONLY' })
    await expect(readOnly.duplicate(seeded.id)).rejects.toMatchObject({
      code: 'CONTENT_READ_ONLY',
    })
    await expect(readOnly.delete(seeded.id)).rejects.toMatchObject({ code: 'CONTENT_READ_ONLY' })
    await expect(readOnly.publish(seeded.id)).rejects.toMatchObject({ code: 'CONTENT_READ_ONLY' })
    await expect(readOnly.unpublish(seeded.id)).rejects.toMatchObject({
      code: 'CONTENT_READ_ONLY',
    })
    await expect(readOnly.restore(seeded.id, 1)).rejects.toMatchObject({
      code: 'CONTENT_READ_ONLY',
    })

    // Nothing above actually wrote — the real store still shows exactly the one seeded row.
    const page = await writable.list({ state: 'published' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.values.title).toBe('Real')
  })

  it('passes every read straight through, unchanged', async () => {
    const writable = createContentStore({ db, collection: tag })
    const seeded = await writable.create({ status: 'published', values: { title: 'Readable' } })

    const readOnly = withReadOnlyStore(writable)

    const read = await readOnly.read(seeded.id)
    expect(read?.values.title).toBe('Readable')

    const page = await readOnly.list({ state: 'published' })
    expect(page.items).toHaveLength(1)

    const history = await readOnly.history(seeded.id)
    expect(history).toHaveLength(1)
  })
})
