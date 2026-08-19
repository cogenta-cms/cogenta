import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asAdmin,
  asEditor,
  asViewer,
  bodyOf,
  createHarness,
  type Harness,
  request,
} from './harness.js'

/**
 * `?counts=1` (fiche 01 "Liste de contenu", task 4): a real `GROUP BY
 * status` alongside a list page, and the same permission layer `list`
 * itself goes through — never a second, unguarded question.
 */

describe('GET /{collection}?counts=1', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('is absent from the response when not asked for', async () => {
    const response = await harness.router.handle(request('GET', `/${ARTICLE.name}`), asEditor)
    expect(bodyOf(response)['counts']).toBeUndefined()
  })

  it('reports a real count by status, corbeille excluded, matching the base exactly', async () => {
    const store = harness.store(ARTICLE)
    await store.create({ values: { title: 'a' }, status: 'draft' })
    await store.create({ values: { title: 'b' }, status: 'draft' })
    await store.create({ values: { title: 'c' }, status: 'published' })
    const archived = await store.create({ values: { title: 'd' }, status: 'archived' })
    // In the trash: must not be counted anywhere (ADR-0022's default).
    await store
      .create({ values: { title: 'e' }, status: 'published' })
      .then((entry) => store.delete(entry.id))

    const response = await harness.router.handle(
      request('GET', `/${ARTICLE.name}`, { query: { counts: '1' } }),
      asEditor,
    )

    expect(response.status).toBe(200)
    expect(bodyOf(response)['counts']).toEqual({
      draft: 2,
      scheduled: 0,
      published: 1,
      archived: 1,
    })

    // The archived entry proves the count is not a page-local tally: the
    // page itself defaults to `state=published` and would not even list it.
    expect(archived.status).toBe('archived')
  })

  it('never tells a role that cannot read drafts how many exist (the fiche\'s own "piège connu")', async () => {
    const store = harness.store(ARTICLE)
    await store.create({ values: { title: 'a' }, status: 'draft' })
    await store.create({ values: { title: 'b' }, status: 'published' })

    const response = await harness.router.handle(
      request('GET', `/${ARTICLE.name}`, { query: { counts: '1' } }),
      asViewer,
    )

    expect(response.status).toBe(200)
    // `published` only — no `draft` key at all, not even `draft: 0`: an
    // absent key cannot be read as "zero", a present one always could be.
    expect(bodyOf(response)['counts']).toEqual({ published: 1 })
  })

  it('gives a role with full draft access every status, including zero ones', async () => {
    const response = await harness.router.handle(
      request('GET', `/${ARTICLE.name}`, { query: { counts: '1' } }),
      asAdmin,
    )

    expect(bodyOf(response)['counts']).toEqual({
      draft: 0,
      scheduled: 0,
      published: 0,
      archived: 0,
    })
  })

  it('refuses counts on a collection this actor may not even read', async () => {
    // `rest_memo` is `read: ['editor']` — public has no access at all.
    const response = await harness.router.handle(
      request('GET', '/rest_memo', { query: { counts: '1' } }),
      { actor: { id: null, roles: ['public'] } },
    )

    expect(response.status).toBe(403)
  })
})
