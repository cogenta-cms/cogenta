import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRedirectStore, type RedirectStore } from '../../src/routing/redirects.js'
import { recordSlugChange } from '../../src/routing/slug-change.js'
import type { CollectionDefinition, ContentStatus } from '../../src/types.js'

const article: CollectionDefinition = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  fields: {
    title: { kind: 'text', options: {} },
    slug: { kind: 'slug', options: { from: 'title' } },
  },
  permissions: { read: ['public'] },
}

/** An entry nobody browses to: no route, so no URL to redirect. */
const author: CollectionDefinition = {
  name: 'author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: {},
  permissions: { read: ['public'] },
}

const page: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {},
  permissions: { read: ['public'] },
}

describe('the redirect table', () => {
  let db: DatabaseHandle
  let store: RedirectStore
  let clock = 0

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    clock = 1_700_000_000_000
    store = createRedirectStore({
      db,
      now: () => {
        clock += 1000
        return clock
      },
    })
  })

  afterEach(async () => {
    await db.close()
  })

  it('sends the old path to the new one', async () => {
    await store.add({ from: '/blog/old', to: '/blog/new' })

    await expect(store.resolve('/blog/old')).resolves.toEqual({ to: '/blog/new', status: 301 })
  })

  it('answers nothing for a path it never heard of', async () => {
    await expect(store.resolve('/blog/unknown')).resolves.toBeNull()
  })

  it('ignores a trailing slash and a query string on the way in', async () => {
    await store.add({ from: '/blog/old/', to: '/blog/new' })

    await expect(store.resolve('/blog/old?utm_source=x')).resolves.toEqual({
      to: '/blog/new',
      status: 301,
    })
  })

  it('flattens a chain, so a page renamed twice still costs one hop', async () => {
    await store.add({ from: '/a', to: '/b' })
    await store.add({ from: '/b', to: '/c' })

    const rows = await store.list()
    expect(rows.map((row) => [row.from, row.to])).toEqual(
      expect.arrayContaining([
        ['/a', '/c'],
        ['/b', '/c'],
      ]),
    )
    await expect(store.resolve('/a')).resolves.toEqual({ to: '/c', status: 301 })
  })

  it('flattens a chain three renames deep', async () => {
    await store.add({ from: '/a', to: '/b' })
    await store.add({ from: '/b', to: '/c' })
    await store.add({ from: '/c', to: '/d' })

    const rows = await store.list()
    expect(rows.every((row) => row.to === '/d')).toBe(true)
  })

  it('refuses a loop rather than serving one', async () => {
    await store.add({ from: '/a', to: '/b' })

    await expect(store.add({ from: '/b', to: '/a' })).rejects.toMatchObject({
      code: 'CONTENT_REDIRECT_LOOP',
    })
  })

  it('refuses a loop that closes further down the chain', async () => {
    await store.add({ from: '/a', to: '/b' })
    await store.add({ from: '/b', to: '/c' })

    await expect(store.add({ from: '/c', to: '/a' })).rejects.toMatchObject({
      code: 'CONTENT_REDIRECT_LOOP',
    })
  })

  it('refuses a path that redirects to itself', async () => {
    await expect(store.add({ from: '/a', to: '/a' })).rejects.toMatchObject({
      code: 'CONTENT_REDIRECT_LOOP',
    })
  })

  it('refuses to redirect away from the site root', async () => {
    await expect(store.add({ from: '/', to: '/home' })).rejects.toMatchObject({
      code: 'CONTENT_ROUTE_INVALID',
    })
  })

  it('replaces a rule rather than keeping two for one path', async () => {
    await store.add({ from: '/a', to: '/b' })
    await store.add({ from: '/a', to: '/c' })

    const rows = await store.list()
    expect(rows.filter((row) => row.from === '/a')).toHaveLength(1)
    await expect(store.resolve('/a')).resolves.toEqual({ to: '/c', status: 301 })
  })

  it('is consultable, filterable and exportable', async () => {
    await store.add({ from: '/a', to: '/b', collection: 'article', locale: 'fr' })
    await store.add({ from: '/x', to: '/y', collection: 'page' })

    await expect(store.list({ collection: 'article' })).resolves.toMatchObject([
      { from: '/a', to: '/b', status: 301, collection: 'article', locale: 'fr' },
    ])
    await expect(store.list()).resolves.toHaveLength(2)
  })

  it('lets an editor delete a rule', async () => {
    await store.add({ from: '/a', to: '/b' })

    await expect(store.remove('/a')).resolves.toBe(true)
    await expect(store.resolve('/a')).resolves.toBeNull()
    await expect(store.remove('/a')).resolves.toBe(false)
  })

  it('carries a temporary status through the chain', async () => {
    await store.add({ from: '/a', to: '/b', status: 302 })

    await expect(store.resolve('/a')).resolves.toEqual({ to: '/b', status: 302 })
  })
})

describe('a slug change on a published entry', () => {
  let db: DatabaseHandle
  let store: RedirectStore

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    store = createRedirectStore({ db })
  })

  afterEach(async () => {
    await db.close()
  })

  function change(
    previousSlug: string,
    nextSlug: string,
    status: ContentStatus = 'published',
  ): Parameters<typeof recordSlugChange>[1] {
    return {
      collection: article,
      entryId: '0199c0f0-0000-7000-8000-000000000001',
      locale: 'fr',
      status,
      previousSlug,
      nextSlug,
    }
  }

  it('creates the 301 with nobody asking for it', async () => {
    const record = await recordSlugChange(store, change('ancien-titre', 'nouveau-titre'))

    expect(record).toMatchObject({
      from: '/fr/blog/ancien-titre',
      to: '/fr/blog/nouveau-titre',
      status: 301,
      reason: 'slug-change',
      collection: 'article',
      locale: 'fr',
    })
    await expect(store.resolve('/fr/blog/ancien-titre')).resolves.toEqual({
      to: '/fr/blog/nouveau-titre',
      status: 301,
    })
  })

  it('records nothing for a draft, which no visitor ever reached', async () => {
    await expect(recordSlugChange(store, change('a', 'b', 'draft'))).resolves.toBeNull()
    await expect(store.list()).resolves.toHaveLength(0)
  })

  it('records nothing when the slug did not actually change', async () => {
    await expect(recordSlugChange(store, change('same', 'same'))).resolves.toBeNull()
  })

  it('records nothing for a collection that has no route', async () => {
    await expect(
      recordSlugChange(store, { ...change('a', 'b'), collection: author }),
    ).resolves.toBeNull()
  })

  it('keeps the two locales of one entry apart', async () => {
    await recordSlugChange(store, change('ancien', 'nouveau'))
    await recordSlugChange(store, { ...change('old', 'new'), locale: 'en' })

    await expect(store.resolve('/fr/blog/ancien')).resolves.toEqual({
      to: '/fr/blog/nouveau',
      status: 301,
    })
    await expect(store.resolve('/en/blog/old')).resolves.toEqual({
      to: '/en/blog/new',
      status: 301,
    })
  })

  it('flattens two successive renames into one hop', async () => {
    await recordSlugChange(store, change('un', 'deux'))
    await recordSlugChange(store, change('deux', 'trois'))

    await expect(store.resolve('/fr/blog/un')).resolves.toEqual({
      to: '/fr/blog/trois',
      status: 301,
    })
  })

  it('lets an editor undo a rename instead of refusing it as a loop', async () => {
    await recordSlugChange(store, change('un', 'deux'))
    const back = await recordSlugChange(store, change('deux', 'un'))

    expect(back).toMatchObject({ from: '/fr/blog/deux', to: '/fr/blog/un' })
    // The old rule is gone: /fr/blog/un is served by the entry again.
    await expect(store.resolve('/fr/blog/un')).resolves.toBeNull()
  })

  it('works on an unlocalised collection', async () => {
    const record = await recordSlugChange(store, {
      collection: page,
      entryId: '0199c0f0-0000-7000-8000-000000000002',
      status: 'published',
      previousSlug: 'contact-us',
      nextSlug: 'contact',
    })

    expect(record).toMatchObject({ from: '/contact-us', to: '/contact', locale: null })
  })
})

describe('410 Gone, 307/308, and editing a rule in place', () => {
  let db: DatabaseHandle
  let store: RedirectStore

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    store = createRedirectStore({ db })
  })

  afterEach(async () => {
    await db.close()
  })

  it('marks a path Gone without needing a destination', async () => {
    const record = await store.add({ from: '/discontinued', status: 410 })

    expect(record).toMatchObject({ from: '/discontinued', status: 410 })
    await expect(store.resolve('/discontinued')).resolves.toEqual({
      to: '/discontinued',
      status: 410,
    })
  })

  it('lets a plain redirect be created into a page later marked Gone, without a false loop', async () => {
    await store.add({ from: '/old-product', status: 410 })
    // Someone points a different old URL at the now-Gone path. `add` must not
    // treat that as a loop — `targetOf` excludes 410 rows from the chain it
    // checks for exactly this reason.
    await expect(store.add({ from: '/other-old-url', to: '/old-product' })).resolves.toMatchObject({
      from: '/other-old-url',
      to: '/old-product',
      status: 301,
    })
  })

  it('reports 410 for a redirect that chains into a page marked Gone', async () => {
    await store.add({ from: '/old-product', status: 410 })
    await store.add({ from: '/other-old-url', to: '/old-product' })

    // `resolve` (the read path, at request time) walks the chain further
    // than `add` needs to: a visitor sent through `/other-old-url` would
    // land on a Gone page anyway, so the honest answer is 410, not a 301 to
    // a dead end.
    await expect(store.resolve('/other-old-url')).resolves.toEqual({
      to: '/old-product',
      status: 410,
    })
    await expect(store.resolve('/old-product')).resolves.toEqual({
      to: '/old-product',
      status: 410,
    })
  })

  it('refuses a redirect with no destination and no 410', async () => {
    await expect(store.add({ from: '/no-target' })).rejects.toMatchObject({
      code: 'CONTENT_ROUTE_INVALID',
    })
  })

  it('accepts 307 and 308, and reports the chain as temporary when any hop is', async () => {
    await store.add({ from: '/a', to: '/b', status: 308 })
    await expect(store.resolve('/a')).resolves.toEqual({ to: '/b', status: 308 })

    await store.add({ from: '/c', to: '/d', status: 307 })
    await expect(store.resolve('/c')).resolves.toEqual({ to: '/d', status: 307 })
  })

  it('edits the target and status of an existing rule without a 404 in between', async () => {
    await store.add({ from: '/old', to: '/first-target' })

    const updated = await store.update('/old', { to: '/second-target', status: 302 })

    expect(updated).toMatchObject({ from: '/old', to: '/second-target', status: 302 })
    await expect(store.resolve('/old')).resolves.toEqual({ to: '/second-target', status: 302 })
  })

  it('lets an edit change only the status, keeping the existing target', async () => {
    await store.add({ from: '/old', to: '/new', reason: 'slug-change' })

    const updated = await store.update('/old', { status: 302 })

    expect(updated).toMatchObject({ from: '/old', to: '/new', status: 302, reason: 'slug-change' })
  })

  it('refuses to edit a rule that does not exist', async () => {
    await expect(store.update('/nowhere', { to: '/somewhere' })).rejects.toMatchObject({
      code: 'REDIRECT_UNKNOWN',
    })
  })

  it('still refuses a loop through an edit', async () => {
    await store.add({ from: '/a', to: '/b' })
    await store.add({ from: '/b', to: '/c' })

    await expect(store.update('/a', { to: '/a' })).rejects.toMatchObject({
      code: 'CONTENT_REDIRECT_LOOP',
    })
  })
})
