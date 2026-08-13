import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asPublic,
  bodyOf,
  createHarness,
  errorOf,
  type Harness,
  idsOf,
  request,
} from './harness.js'

describe('cursor pagination', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  async function seed(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await harness.store(ARTICLE).create({
        id,
        status: 'published',
        values: { title: `Article ${id}` },
      })
    }
  }

  function pageOf(body: Record<string, unknown>): Record<string, unknown> {
    const page = body['page']
    return typeof page === 'object' && page !== null ? (page as Record<string, unknown>) : {}
  }

  it('hands out every entry exactly once when rows are inserted before the cursor', async () => {
    await seed(['id-01', 'id-02', 'id-03', 'id-04', 'id-05', 'id-06'])

    const first = await harness.router.handle(
      request('GET', '/rest_article', { query: { sort: 'id:asc', limit: '3' } }),
      asPublic,
    )
    expect(idsOf(first)).toEqual(['id-01', 'id-02', 'id-03'])

    const cursor = pageOf(bodyOf(first))['nextCursor']
    expect(typeof cursor).toBe('string')

    // The concurrent write an offset cannot survive: three new rows land *before*
    // the cursor position, which would shift every offset-based page by three
    // and make the reader see id-04 twice and never see id-06.
    await seed(['id-00', 'id-015', 'id-025'])

    const second = await harness.router.handle(
      request('GET', '/rest_article', {
        query: { sort: 'id:asc', limit: '3', after: String(cursor) },
      }),
      asPublic,
    )

    expect(idsOf(second)).toEqual(['id-04', 'id-05', 'id-06'])
  })

  it('walks a whole collection without repeating or losing an entry while it grows', async () => {
    await seed(['b1', 'b2', 'b3', 'b4', 'b5'])

    const seen: string[] = []
    let cursor: string | undefined
    let inserted = 0

    for (let page = 0; page < 10; page += 1) {
      const response = await harness.router.handle(
        request('GET', '/rest_article', {
          query: {
            sort: 'id:asc',
            limit: '2',
            ...(cursor === undefined ? {} : { after: cursor }),
          },
        }),
        asPublic,
      )

      seen.push(...idsOf(response))
      const next = pageOf(bodyOf(response))['nextCursor']

      // A writer inserting behind the reader on every page turn.
      if (inserted < 3) {
        await seed([`a${inserted}`])
        inserted += 1
      }

      if (typeof next !== 'string') break
      cursor = next
    }

    expect(seen).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('reports no further page when the collection is exhausted', async () => {
    await seed(['c1', 'c2'])

    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { sort: 'id:asc', limit: '5' } }),
      asPublic,
    )

    expect(pageOf(bodyOf(response))).toEqual({ hasMore: false, nextCursor: null })
  })

  it('refuses a cursor taken under a different sort order', async () => {
    await seed(['d1', 'd2', 'd3'])

    const first = await harness.router.handle(
      request('GET', '/rest_article', { query: { sort: 'id:asc', limit: '1' } }),
      asPublic,
    )
    const cursor = String(pageOf(bodyOf(first))['nextCursor'])

    const response = await harness.router.handle(
      request('GET', '/rest_article', {
        query: { sort: 'createdAt:asc', limit: '1', after: cursor },
      }),
      asPublic,
    )

    expect(response.status).toBe(400)
  })

  it('keeps the cursor stable when a filter rejects most of the rows', async () => {
    for (const id of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) {
      await harness.store(ARTICLE).create({
        id,
        status: 'published',
        values: { title: `Article ${id}`, featured: id === 'e2' || id === 'e5' },
      })
    }

    const first = await harness.router.handle(
      request('GET', '/rest_article', {
        query: { sort: 'id:asc', limit: '1', 'filter.featured.eq': 'true' },
      }),
      asPublic,
    )
    expect(idsOf(first)).toEqual(['e2'])

    const second = await harness.router.handle(
      request('GET', '/rest_article', {
        query: {
          sort: 'id:asc',
          limit: '1',
          'filter.featured.eq': 'true',
          after: String(pageOf(bodyOf(first))['nextCursor']),
        },
      }),
      asPublic,
    )
    expect(idsOf(second)).toEqual(['e5'])
  })

  it('names the parameter when a page size is out of range', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { limit: '5000' } }),
      asPublic,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('QUERY_INVALID')
    expect(errorOf(response).message).toContain('"limit"')
    expect(errorOf(response).message).not.toContain('5000')
  })
})
