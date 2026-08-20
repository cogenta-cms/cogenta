import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asAdmin,
  asEditor,
  asPublic,
  asViewer,
  createHarness,
  type Harness,
  listOf,
  MEMO,
  request,
} from './harness.js'

/**
 * `/-/summary` — fiche 22 tâche 1's dashboard content summary, and fiche 01
 * tâche 4's per-collection status tabs: the same `ContentStore.count()`
 * underneath, exposed as one request across every readable collection.
 *
 * Two properties matter more than the count itself: it never runs one HTTP
 * round trip per collection (this whole file drives it through one request),
 * and it never tells an actor about unpublished rows or the trash of a
 * collection they could not otherwise reach that way — the same leak L1's own
 * spec names for `?counts=1`.
 */
describe('the content summary', () => {
  let harness: Harness

  const summary = (context: Parameters<Harness['router']['handle']>[1]) =>
    harness.router.handle(request('GET', '/-/summary'), context)

  beforeEach(async () => {
    harness = await createHarness()

    const articles = harness.store(ARTICLE)
    await articles.create({ values: { title: 'd1' } })
    await articles.create({ values: { title: 'd2' } })
    const published = await articles.create({ values: { title: 'p1' } })
    await articles.publish(published.id)
    const trashed = await articles.create({ values: { title: 't1' } })
    await articles.delete(trashed.id)
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('answers every readable collection in one request', async () => {
    const response = await summary(asAdmin)
    expect(response.status).toBe(200)

    const rows = listOf(response)
    const names = rows.map((row) => row['collection'])
    // `MEMO` reads `['editor']` only — an `admin` actor here holds no role
    // this schema grants `read` to, so it must be absent, not zeroed out.
    expect(names).toContain('rest_article')
    expect(names).not.toContain(MEMO.name)
  })

  it('breaks a readable collection down by status for an actor who may read drafts', async () => {
    const rows = listOf(await summary(asAdmin))
    const article = rows.find((row) => row['collection'] === 'rest_article')

    expect(article).toMatchObject({
      draft: 2,
      published: 1,
      scheduled: 0,
      archived: 0,
      trashed: 1,
      total: 3,
    })
  })

  it('gives an actor without draft access the published count only, and nothing else', async () => {
    const rows = listOf(await summary(asPublic))
    const article = rows.find((row) => row['collection'] === 'rest_article')

    // Not a `draft: 0` that would itself be a fact about drafts this actor
    // has no business knowing — the field is absent.
    expect(article).toMatchObject({
      published: 1,
      total: 1,
      draft: null,
      scheduled: null,
      archived: null,
      trashed: null,
    })
  })

  it('gives an actor who may read drafts but not delete no trash count', async () => {
    // `editor` may read unpublished rows (`update` grants it here) but
    // `delete` is `admin`-only on this collection — the trash figure must
    // follow the same permission `list()`'s own trash access requires.
    const rows = listOf(await summary(asEditor))
    const article = rows.find((row) => row['collection'] === 'rest_article')

    expect(article?.['draft']).toBe(2)
    expect(article?.['trashed']).toBeNull()
  })

  it('never leaks a collection this actor cannot read at all', async () => {
    const rows = listOf(await summary(asViewer))
    expect(rows.some((row) => row['collection'] === MEMO.name)).toBe(false)
  })
})
