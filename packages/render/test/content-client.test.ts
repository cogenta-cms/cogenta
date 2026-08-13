import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createContentClient, type FetchLike } from '../src/index.js'

/**
 * The content client is HTTP and only HTTP (ADR-0016), so these tests hold it
 * to its wire behaviour: what it sends, what it does with what comes back, and
 * what it never lets out.
 */

interface Call {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

function recorder(responses: readonly Response[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  let index = 0
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
      const response = responses[Math.min(index, responses.length - 1)]
      index += 1
      if (response === undefined) throw new Error('no response queued')
      return response
    },
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const client = (fetch: FetchLike) =>
  createContentClient({ url: 'https://api.example.test', token: 'read-only-token', fetch })

describe('the content client', () => {
  it('carries the read token on every request and asks for nothing else', async () => {
    const { fetch, calls } = recorder([json({ data: { id: 'a' } })])

    await client(fetch).entry('article', 'a')

    expect(calls[0]?.url).toBe('https://api.example.test/api/content/article/a')
    expect(calls[0]?.headers.authorization).toBe('Bearer read-only-token')
  })

  it('reads a missing entry as absent, not as a failure', async () => {
    const { fetch } = recorder([json({ error: { code: 'CONTENT_NOT_FOUND' } }, 404)])

    await expect(client(fetch).entry('article', 'nope')).resolves.toBeNull()
  })

  it('turns a page of entries into the shape a theme iterates', async () => {
    const { fetch, calls } = recorder([
      json({ data: [{ id: 'a' }, { id: 'b' }], page: { hasMore: true, nextCursor: 'c2' } }),
    ])

    const page = await client(fetch).list({
      collection: 'article',
      locale: 'fr',
      limit: 2,
      sort: [{ field: 'publishedAt', direction: 'desc' }],
    })

    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBe('c2')
    expect(calls[0]?.url).toContain('sort=-publishedAt')
    expect(calls[0]?.url).toContain('locale=fr')
  })

  it('explains a refusal in terms of the public role rather than leaking the token', async () => {
    const { fetch } = recorder([json({ error: { code: 'FORBIDDEN', message: 'draft' } }, 403)])

    const error = await client(fetch)
      .entry('article', 'draft')
      .catch((caught: unknown) => caught)

    expect(isCogentaError(error)).toBe(true)
    if (!isCogentaError(error)) return
    expect(error.code).toBe('CONTENT_API_FAILED')
    expect(error.hint).toContain('`public` role')
    // Rule R7: a credential never travels in an error, a log or a hint.
    expect(JSON.stringify(error.toJSON())).not.toContain('read-only-token')
  })

  it('says the API is unreachable rather than failing with a network error', async () => {
    const fetch: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }

    const error = await client(fetch)
      .list({ collection: 'article' })
      .catch((caught: unknown) => caught)

    expect(isCogentaError(error)).toBe(true)
    if (!isCogentaError(error)) return
    expect(error.code).toBe('CONTENT_API_FAILED')
    expect(error.hint).toContain('ADR-0016')
  })

  it('resolves a URL through the route lookup, not through a collection guess', async () => {
    const { fetch, calls } = recorder([json({ data: { id: 'a' } })])

    await client(fetch).byPath('/blog/hello')

    expect(calls[0]?.url).toContain('/api/content/-/by-path?path=%2Fblog%2Fhello')
  })
})

describe('dependencies declared on the wire', () => {
  it('reports what a read actually depended on, entries stripped of their collection prefix', async () => {
    // The API qualifies as `<collection>:<id>` because two collections can
    // collide on a bare id; the render side tags by bare id because it does
    // not know the collection and does not need to (ids are UUIDv7, unique
    // everywhere). This is the seam between the two conventions.
    const { fetch } = recorder([
      json({
        data: { id: 'article-1' },
        meta: { dependencies: { entries: ['author:a1'], media: ['m1'], collections: ['tag'] } },
      }),
    ])
    const seen: unknown[] = []

    await createContentClient({
      url: 'https://api.example.test',
      token: 'read-only-token',
      fetch,
      onDependencies: (dependencies) => seen.push(dependencies),
    }).entry('article', 'article-1')

    expect(seen).toEqual([{ entries: ['a1'], media: ['m1'], collections: ['tag'] }])
  })

  it('fires on a list read too — the case a page-cache miss would otherwise hide', async () => {
    // This is the exact failure the render cache exists to prevent: an article
    // list inlines each article's author, the author's id never crosses the
    // client as a request of its own, and without this hook the page would
    // stay stale forever after the author is renamed.
    const { fetch } = recorder([
      json({
        data: [{ id: 'article-1' }],
        page: { hasMore: false, nextCursor: null },
        meta: { dependencies: { entries: ['author:a1'], media: [], collections: ['article'] } },
      }),
    ])
    const seen: unknown[] = []

    await createContentClient({
      url: 'https://api.example.test',
      token: 'read-only-token',
      fetch,
      onDependencies: (dependencies) => seen.push(dependencies),
    }).list({ collection: 'article' })

    expect(seen).toEqual([{ entries: ['a1'], media: [], collections: ['article'] }])
  })

  it('does nothing when the response carries no dependency metadata', async () => {
    const { fetch } = recorder([json({ data: { id: 'a' } })])
    const seen: unknown[] = []

    await createContentClient({
      url: 'https://api.example.test',
      token: 'read-only-token',
      fetch,
      onDependencies: (dependencies) => seen.push(dependencies),
    }).entry('article', 'a')

    expect(seen).toEqual([])
  })

  it('never throws for a caller that did not ask to be told', async () => {
    const { fetch } = recorder([
      json({
        data: { id: 'a' },
        meta: { dependencies: { entries: ['x:1'], media: [], collections: [] } },
      }),
    ])

    await expect(client(fetch).entry('article', 'a')).resolves.toEqual({ id: 'a' })
  })
})
