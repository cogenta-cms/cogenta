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
