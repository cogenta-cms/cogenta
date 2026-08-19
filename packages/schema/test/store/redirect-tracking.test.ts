import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRedirectStore, type RedirectStore } from '../../src/routing/redirects.js'
import { withRedirectTracking } from '../../src/store/redirect-tracking.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * `withRedirectTracking` — fiche 12 task 3, the write-side half of the
 * feature the fiche calls "the most profitable of this fiche": renaming the
 * slug of a published entry must write its own 301, with nobody asking for
 * it. `recordSlugChange` (`../../src/routing/slug-change.js`) already proves
 * the redirect-table mechanics (chains, loops, reversibility) in isolation;
 * this suite proves the *wiring* — that a real save through a real
 * `ContentStore` actually calls it, and only when the entry it changed was
 * really public.
 */

const page: CollectionDefinition = {
  name: 'redirect_tracking_page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', options: { max: 200 } },
    slug: { kind: 'slug', options: { from: 'title' } },
  },
  permissions: { read: ['public'] },
}

const draftedPage: CollectionDefinition = {
  ...page,
  name: 'redirect_tracking_drafted_page',
  versioning: { drafts: true },
}

const noSlug: CollectionDefinition = {
  name: 'redirect_tracking_no_slug',
  labels: { singular: 'Thing', plural: 'Things' },
  fields: { title: { kind: 'text', options: {} } },
  permissions: { read: ['public'] },
}

describe('withRedirectTracking', () => {
  let directory: string
  let db: DatabaseHandle
  let redirects: RedirectStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-redirect-tracking-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [page, draftedPage, noSlug])
    redirects = createRedirectStore({ db })
  })

  afterEach(async () => {
    await dropSchemaTables(db, [page, draftedPage, noSlug])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('writes a 301 the moment a published entry is saved under a new slug', async () => {
    const store = withRedirectTracking(createContentStore({ db, collection: page }), {
      collection: page,
      redirects,
    })

    const entry = await store.create({
      status: 'published',
      values: { title: 'Old title', slug: 'old-title' },
    })
    await store.update(entry.id, { values: { slug: 'new-title' } })

    await expect(redirects.resolve('/old-title')).resolves.toEqual({
      to: '/new-title',
      status: 301,
    })
  })

  it('writes nothing for a draft — it never had a public URL to leave behind', async () => {
    const store = withRedirectTracking(createContentStore({ db, collection: page }), {
      collection: page,
      redirects,
    })

    const entry = await store.create({
      status: 'draft',
      values: { title: 'Draft', slug: 'draft-slug' },
    })
    await store.update(entry.id, { values: { slug: 'renamed-draft' } })

    await expect(redirects.resolve('/draft-slug')).resolves.toBeNull()
  })

  it('waits for publish() when drafts are on, rather than redirecting an unpublished change', async () => {
    const store = withRedirectTracking(createContentStore({ db, collection: draftedPage }), {
      collection: draftedPage,
      redirects,
    })

    const entry = await store.create({
      status: 'published',
      values: { title: 'Live title', slug: 'live-title' },
    })
    // With drafts on, this only stages the rename — the public face keeps
    // its old slug until `publish()`.
    await store.update(entry.id, { values: { slug: 'staged-title' } })
    await expect(redirects.resolve('/live-title')).resolves.toBeNull()

    await store.publish(entry.id)
    await expect(redirects.resolve('/live-title')).resolves.toEqual({
      to: '/staged-title',
      status: 301,
    })
  })

  it('lets renaming back to the old slug make the redirect disappear', async () => {
    const store = withRedirectTracking(createContentStore({ db, collection: page }), {
      collection: page,
      redirects,
    })

    const entry = await store.create({
      status: 'published',
      values: { title: 'A', slug: 'a' },
    })
    await store.update(entry.id, { values: { slug: 'b' } })
    await expect(redirects.resolve('/a')).resolves.toEqual({ to: '/b', status: 301 })

    await store.update(entry.id, { values: { slug: 'a' } })
    await expect(redirects.resolve('/a')).resolves.toBeNull()
  })

  it('does nothing extra for a collection with no slug field', async () => {
    const inner = createContentStore({ db, collection: noSlug })
    const store = withRedirectTracking(inner, { collection: noSlug, redirects })

    // No slug field to key a redirect on: the decorator returns the store
    // unwrapped rather than paying for reads that could never find one.
    expect(store).toBe(inner)
  })

  it('never lets a failed redirect write fail the content save', async () => {
    const failingRedirects: RedirectStore = {
      ...redirects,
      add: async () => {
        throw new Error('table is locked')
      },
    }
    let reported: unknown
    const store = withRedirectTracking(createContentStore({ db, collection: page }), {
      collection: page,
      redirects: failingRedirects,
      onError: (error) => {
        reported = error
      },
    })

    const entry = await store.create({
      status: 'published',
      values: { title: 'Old', slug: 'old' },
    })
    await expect(store.update(entry.id, { values: { slug: 'new' } })).resolves.toMatchObject({
      values: { slug: 'new' },
    })
    expect(reported).toBeInstanceOf(Error)
  })
})
