import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createContentStore, createSearchIndex } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { post } from '../src/blueprints/blog.js'
import { resetPlaygroundData } from '../src/playground-reset.js'

describe('resetPlaygroundData', () => {
  const dirs: string[] = []
  let db: DatabaseHandle | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('wipes real playground content and reseeds the real blog demo data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-playground-'))
    dirs.push(directory)
    db = await createSqliteHandle({ url: join(directory, 'site.db') })

    await resetPlaygroundData({ db, blueprintId: 'blog', defaultLocale: 'en' })

    const posts = createContentStore({ db, collection: post, defaultLocale: 'en' })
    const firstPass = await posts.list({ state: 'published' })
    expect(firstPass.items.length).toBeGreaterThan(0)

    // Simulate a playground visitor "vandalising" the demo data.
    const [victim] = firstPass.items
    if (victim !== undefined) {
      await posts.update(victim.id, { values: { title: 'Hacked by a visitor' } })
    }

    await resetPlaygroundData({ db, blueprintId: 'blog', defaultLocale: 'en' })

    const afterReset = await posts.list({ state: 'published' })
    expect(afterReset.items).toHaveLength(firstPass.items.length)
    // Real demo content is back, verbatim — nothing a prior visitor did survived.
    expect(afterReset.items.every((item) => item.values.title !== 'Hacked by a visitor')).toBe(true)
  })

  it('attributes reseeded content to a real admin when one already exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-playground-admin-'))
    dirs.push(directory)
    db = await createSqliteHandle({ url: join(directory, 'site.db') })
    await ensureAuthTables(db)
    const admin = await createUserStore(db).create({ email: 'owner@example.com', roles: ['admin'] })

    await resetPlaygroundData({
      db,
      blueprintId: 'blog',
      defaultLocale: 'en',
      adminEmail: 'owner@example.com',
    })

    // `category`/`tag` are taxonomies (T02) — a term has no `createdBy` of
    // its own (ADR-0022: no status, no version, no author). `post` is the
    // seeded collection that still carries attribution.
    const posts = createContentStore({ db, collection: post, defaultLocale: 'en' })
    const page = await posts.list({ state: 'published' })
    expect(page.items[0]?.createdBy).toBe(admin.id)
  })

  // L20 audit, point 2: `pack.seedDemoContent` writes straight through
  // `createContentStore`, never through the `withSearchIndexing`-wrapped
  // store `cogenta serve` builds — a reset playground would otherwise leave
  // its search index empty (or stale from before the reset), same root cause
  // as the installer's own seed path.
  it('reindexes the reseeded demo content for search', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-playground-search-'))
    dirs.push(directory)
    db = await createSqliteHandle({ url: join(directory, 'site.db') })

    await resetPlaygroundData({ db, blueprintId: 'blog', defaultLocale: 'en' })

    const index = await createSearchIndex({ db })
    const results = await index.search({ text: 'Cogenta', locale: 'en' })
    expect(results.hits.length).toBeGreaterThan(0)
    expect(results.hits.some((hit) => hit.collection === 'post')).toBe(true)
  })

  it('refuses an unknown blueprint id with a real, typed error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-playground-unknown-'))
    dirs.push(directory)
    db = await createSqliteHandle({ url: join(directory, 'site.db') })

    await expect(
      resetPlaygroundData({ db, blueprintId: 'not-a-real-blueprint' }),
    ).rejects.toMatchObject({ code: 'PLAYGROUND_BLUEPRINT_UNKNOWN' })
  })
})
