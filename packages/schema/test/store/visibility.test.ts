import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { schema22Migration } from '../../src/store/schema-2-2-migration.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * L33 step 1 — visibility is a field of its own, orthogonal to `status`
 * (`schema@2.2`, ADR-0034), and the password a protected entry asks for never
 * leaves the store.
 */

const page: CollectionDefinition = {
  name: 'vis_page',
  labels: { singular: 'Page', plural: 'Pages' },
  versioning: { drafts: true, history: true },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: { read: ['public'] },
}

/** Stands in for a real password hasher: this store stores what it is given. */
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

describe('an entry’s visibility', () => {
  let directory: string
  let db: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-visibility-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [page])
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('is public until someone says otherwise, whatever the status', async () => {
    const store = createContentStore({ db, collection: page })

    const draft = await store.create({ values: { title: 'Une page' } })
    expect(draft.visibility).toBe('public')

    const published = await store.publish(draft.id)
    expect(published.visibility).toBe('public')
  })

  it('does not touch the status — a private page stays published', async () => {
    const store = createContentStore({ db, collection: page })
    const entry = await store.create({ values: { title: 'Note interne' } })
    await store.publish(entry.id)

    const hidden = await store.setVisibility(entry.id, 'private')

    // The whole point of the orthogonality: hiding is not unpublishing.
    expect(hidden.visibility).toBe('private')
    expect((await store.read(entry.id))?.status).toBe('published')

    const back = await store.setVisibility(entry.id, 'public')
    expect(back.visibility).toBe('public')
    expect((await store.read(entry.id))?.status).toBe('published')
  })

  it('never hands the password back, and verifies it without giving it out', async () => {
    const store = createContentStore({ db, collection: page })
    const entry = await store.create({ values: { title: 'Dossier de presse' } })

    const protectedEntry = await store.setVisibility(entry.id, 'password', {
      passwordHash: hash('sésame'),
    })

    // Nothing in what a read returns carries the hash, let alone the password.
    expect(JSON.stringify(protectedEntry)).not.toContain(hash('sésame'))
    expect(JSON.stringify(await store.read(entry.id))).not.toContain(hash('sésame'))

    expect(await store.verifyEntryPassword(entry.id, async (h) => h === hash('sésame'))).toBe(true)
    expect(await store.verifyEntryPassword(entry.id, async (h) => h === hash('ouvre-toi'))).toBe(
      false,
    )
  })

  it('refuses a protected entry with no password, and forgets the old one when it opens', async () => {
    const store = createContentStore({ db, collection: page })
    const entry = await store.create({ values: { title: 'Dossier' } })

    await expect(store.setVisibility(entry.id, 'password')).rejects.toMatchObject({
      code: 'CONTENT_INVALID',
    })

    await store.setVisibility(entry.id, 'password', { passwordHash: hash('sésame') })
    await store.setVisibility(entry.id, 'public')

    // The hash is gone, so an old cookie cannot unlock a page that stopped
    // being protected — and a page protected again asks for a new password.
    expect(await store.verifyEntryPassword(entry.id, async () => true)).toBe(false)
  })

  it('leaves the search index when it stops being public, and returns when it is', async () => {
    const { createSqliteSearch } = await import('../../src/search/sqlite.js')
    const { withSearchIndexing } = await import('../../src/store/search-indexing.js')
    const index = await createSqliteSearch({ db, fts5: true })
    const store = withSearchIndexing(createContentStore({ db, collection: page }), {
      collection: page,
      index,
    })

    const entry = await store.create({ values: { title: 'Note interne' } })
    await store.publish(entry.id)
    expect((await index.search({ text: 'interne', locale: 'en' })).hits).toHaveLength(1)

    // Site search is read by anyone: an excerpt of a private note in a result
    // list would be the note, published.
    await store.setVisibility(entry.id, 'private')
    expect((await index.search({ text: 'interne', locale: 'en' })).hits).toHaveLength(0)

    await store.setVisibility(entry.id, 'public')
    expect((await index.search({ text: 'interne', locale: 'en' })).hits).toHaveLength(1)
  })

  it('leaves an entry of a database written before the column existed public', async () => {
    // The migration's own promise: nothing becomes private by being migrated.
    const migration = schema22Migration({ collections: [page] })

    expect(migration.destructive).toBe(false)
    expect(migration.impact).toContain("default 'public'")
  })
})
