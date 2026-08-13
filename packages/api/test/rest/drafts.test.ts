import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
import {
  ARTICLE,
  asEditor,
  asPublic,
  asViewer,
  createHarness,
  dataOf,
  errorOf,
  type Harness,
  idsOf,
  request,
  valuesOf,
} from './harness.js'

/**
 * "The `public` role can reach no draft, on no route, whatever the query says"
 * is the acceptance criterion this file exists for — plus the hole the seam
 * cannot close on its own: `canReadUnpublished` is told a collection and not an
 * entry, so a preview grant for one entry must not unlock the collection.
 */
describe('drafts and preview grants', () => {
  let harness: Harness

  const grantFor = (entryId: string, expiresAt: number): AccessContext => ({
    actor: ANONYMOUS,
    preview: { collection: 'rest_article', entryId, expiresAt },
  })

  beforeEach(async () => {
    harness = await createHarness()
    const articles = harness.store(ARTICLE)

    await articles.create({ id: 'draft-a', values: { title: 'Draft A' } })
    await articles.create({ id: 'draft-b', values: { title: 'Draft B' } })
    await articles.create({ id: 'live-c', status: 'published', values: { title: 'Live C' } })
    // A published entry with a pending edit: its working face is a draft even
    // though its status says "published".
    await articles.update('live-c', { values: { title: 'Live C, revised' } })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('never lists a draft for an anonymous caller', async () => {
    const response = await harness.router.handle(request('GET', '/rest_article'), asPublic)

    expect(idsOf(response)).toEqual(['live-c'])
  })

  it('refuses an anonymous caller that asks for the working state outright', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working' } }),
      asPublic,
    )

    expect(response.status).toBe(403)
    expect(errorOf(response).code).toBe('FORBIDDEN')
  })

  it('refuses an anonymous caller that asks for drafts through the status parameter', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { status: 'draft' } }),
      asPublic,
    )

    expect(response.status).toBe(403)
  })

  it('returns nothing rather than a draft when a filter asks for one', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { 'filter.status.eq': 'draft' } }),
      asPublic,
    )

    expect(response.status).toBe(200)
    expect(idsOf(response)).toEqual([])
  })

  it('shows the published values of an entry that has a pending edit', async () => {
    const response = await harness.router.handle(request('GET', '/rest_article/live-c'), asPublic)

    expect(valuesOf(dataOf(response))['title']).toBe('Live C')
  })

  it('answers 404 rather than 403 when the public reads a draft by identifier', async () => {
    const response = await harness.router.handle(request('GET', '/rest_article/draft-a'), asPublic)

    expect(response.status).toBe(404)
  })

  it('gives a read-only role no draft access even though it may read the collection', async () => {
    const listed = await harness.router.handle(request('GET', '/rest_article'), asViewer)
    expect(idsOf(listed)).toEqual(['live-c'])

    const working = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working' } }),
      asViewer,
    )
    expect(working.status).toBe(403)
  })

  it('gives an authoring role the drafts of the collection', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working', sort: 'id:asc' } }),
      asEditor,
    )

    expect(idsOf(response)).toEqual(['draft-a', 'draft-b', 'live-c'])
  })

  it('lets a preview grant open exactly the entry it was issued for', async () => {
    const context = grantFor('draft-a', Date.now() + 60_000)

    const allowed = await harness.router.handle(
      request('GET', '/rest_article/draft-a', { query: { state: 'working' } }),
      context,
    )
    expect(allowed.status).toBe(200)
    expect(valuesOf(dataOf(allowed))['title']).toBe('Draft A')

    const refused = await harness.router.handle(
      request('GET', '/rest_article/draft-b', { query: { state: 'working' } }),
      context,
    )
    expect(refused.status).toBe(404)
  })

  it('shows only the granted entry in a list, never the other drafts of the collection', async () => {
    const context = grantFor('draft-a', Date.now() + 60_000)

    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working', sort: 'id:asc' } }),
      context,
    )

    expect(response.status).toBe(200)
    expect(idsOf(response)).toEqual(['draft-a'])
  })

  it('does not let a preview grant reach the pending edit of another entry', async () => {
    const context = grantFor('draft-a', Date.now() + 60_000)

    const response = await harness.router.handle(
      request('GET', '/rest_article/live-c', { query: { state: 'working' } }),
      context,
    )

    expect(response.status).toBe(404)
  })

  it('does not let a preview grant open the history or the diff of another entry', async () => {
    const context = grantFor('draft-a', Date.now() + 60_000)

    const own = await harness.router.handle(
      request('GET', '/rest_article/draft-a/history'),
      context,
    )
    expect(own.status).toBe(200)

    const other = await harness.router.handle(
      request('GET', '/rest_article/draft-b/history'),
      context,
    )
    expect(other.status).toBe(404)
  })

  it('gives an expired preview grant access to nothing at all', async () => {
    const context = grantFor('draft-a', Date.now() - 1_000)

    const response = await harness.router.handle(
      request('GET', '/rest_article/draft-a', { query: { state: 'working' } }),
      context,
    )

    expect(response.status).toBe(403)
  })

  it('never turns a preview grant into a write', async () => {
    const context = grantFor('draft-a', Date.now() + 60_000)

    const updated = await harness.router.handle(
      request('PATCH', '/rest_article/draft-a', { body: { values: { title: 'Hijacked' } } }),
      context,
    )
    expect(updated.status).toBe(403)

    const published = await harness.router.handle(
      request('POST', '/rest_article/draft-a/publish'),
      context,
    )
    expect(published.status).toBe(403)
  })
})
