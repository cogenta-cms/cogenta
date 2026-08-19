import { afterEach, describe, expect, it, vi } from 'vitest'
import { listEntries } from '../src/api/content-client.js'

/**
 * `listEntries`'s query-string construction for fiche 01 ("Liste de
 * contenu") tasks 4 and 5 — the date range, locale and taxonomy-term
 * filters, and `?counts=1`. Asserted against the request URL directly:
 * whether the server actually *honours* `filter.updatedAt.gte` is already
 * proven in `@cogenta/api`'s own test suite (`packages/api/test/rest/filters.test.ts`
 * and `packages/api/test/rest/counts.test.ts`); what this admin has to get
 * right is sending the request the contract expects.
 */

function stubFetch(): { calls: string[] } {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input.toString())
      return Promise.resolve(
        new Response(JSON.stringify({ data: [], page: { hasMore: false, nextCursor: null } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }),
  )
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listEntries query construction', () => {
  it('sends the updatedAt range as filter.updatedAt.gte/lte', async () => {
    const { calls } = stubFetch()

    await listEntries('token', 'article', {
      updatedFrom: '2026-01-01T00:00:00.000Z',
      updatedTo: '2026-01-31T23:59:59.999Z',
    })

    const url = new URL(calls[0] ?? '', 'http://localhost')
    expect(url.searchParams.get('filter.updatedAt.gte')).toBe('2026-01-01T00:00:00.000Z')
    expect(url.searchParams.get('filter.updatedAt.lte')).toBe('2026-01-31T23:59:59.999Z')
  })

  it('sends the locale filter as a plain ?locale=', async () => {
    const { calls } = stubFetch()

    await listEntries('token', 'article', { locale: 'fr' })

    const url = new URL(calls[0] ?? '', 'http://localhost')
    expect(url.searchParams.get('locale')).toBe('fr')
  })

  it('filters a to-many taxonomy field with "contains", not "eq"', async () => {
    const { calls } = stubFetch()

    await listEntries('token', 'article', {
      termFilter: { field: 'topics', termId: 'term-1', many: true },
    })

    const url = new URL(calls[0] ?? '', 'http://localhost')
    expect(url.searchParams.get('filter.topics.contains')).toBe('term-1')
    expect(url.searchParams.has('filter.topics.eq')).toBe(false)
  })

  it('filters a single-valued taxonomy field with "eq"', async () => {
    const { calls } = stubFetch()

    await listEntries('token', 'article', {
      termFilter: { field: 'category', termId: 'term-1', many: false },
    })

    const url = new URL(calls[0] ?? '', 'http://localhost')
    expect(url.searchParams.get('filter.category.eq')).toBe('term-1')
  })

  it('asks for counts only when told to', async () => {
    const { calls: withoutCounts } = stubFetch()
    await listEntries('token', 'article', {})
    expect(new URL(withoutCounts[0] ?? '', 'http://localhost').searchParams.has('counts')).toBe(
      false,
    )

    vi.unstubAllGlobals()
    const { calls: withCounts } = stubFetch()
    await listEntries('token', 'article', { counts: true })
    expect(new URL(withCounts[0] ?? '', 'http://localhost').searchParams.get('counts')).toBe('1')
  })

  it('reads the counts field back off the response when the server sends one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [],
              page: { hasMore: false, nextCursor: null },
              counts: { draft: 2, published: 5 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    )

    const page = await listEntries('token', 'article', { counts: true })

    expect(page.counts).toEqual({ draft: 2, published: 5 })
  })
})
