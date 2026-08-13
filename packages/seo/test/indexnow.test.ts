import { describe, expect, it, vi } from 'vitest'
import {
  INDEXNOW_MAX_URLS,
  type IndexNowFetch,
  indexNowKeyFile,
  pingIndexNow,
} from '../src/indexnow.js'

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

function okFetch(status = 200): IndexNowFetch {
  return vi.fn(async () => ({ ok: status < 400, status }))
}

describe('the IndexNow key file', () => {
  it('is served at the path the endpoint fetches to verify ownership', () => {
    expect(indexNowKeyFile(KEY)).toEqual({ path: `/${KEY}.txt`, contents: `${KEY}\n` })
  })

  it('refuses a key that is not hexadecimal', () => {
    expect(() => indexNowKeyFile('not-a-key')).toThrow(/8 to 128 hexadecimal/)
  })
})

describe('pinging IndexNow', () => {
  it('posts the host, key and URL list to the endpoint', async () => {
    const send = okFetch()
    const result = await pingIndexNow({
      host: 'example.com',
      key: KEY,
      urls: ['https://example.com/a', 'https://example.com/b'],
      fetch: send,
    })

    expect(result).toEqual({ outcome: 'submitted', status: 200, urlCount: 2 })

    const call = vi.mocked(send).mock.calls[0]
    expect(call?.[0]).toBe('https://api.indexnow.org/indexnow')
    expect(JSON.parse(call?.[1].body ?? '{}')).toEqual({
      host: 'example.com',
      key: KEY,
      urlList: ['https://example.com/a', 'https://example.com/b'],
    })
  })

  it('includes keyLocation only when the site cannot serve the key at its root', async () => {
    const send = okFetch()
    await pingIndexNow({
      host: 'example.com',
      key: KEY,
      keyLocation: 'https://example.com/static/key.txt',
      urls: ['https://example.com/a'],
      fetch: send,
    })

    const body: unknown = JSON.parse(vi.mocked(send).mock.calls[0]?.[1].body ?? '{}')
    expect((body as Record<string, unknown>).keyLocation).toBe('https://example.com/static/key.txt')
  })

  it('reports an HTTP failure without throwing, so publishing never fails on it', async () => {
    const result = await pingIndexNow({
      host: 'example.com',
      key: KEY,
      urls: ['https://example.com/a'],
      fetch: okFetch(429),
    })

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'http',
      status: 429,
      message: 'The IndexNow endpoint answered 429.',
    })
  })

  it('reports a network failure without throwing', async () => {
    const result = await pingIndexNow({
      host: 'example.com',
      key: KEY,
      urls: ['https://example.com/a'],
      fetch: async () => {
        throw new Error('ECONNREFUSED')
      },
    })

    expect(result).toMatchObject({ outcome: 'failed', reason: 'network', message: 'ECONNREFUSED' })
  })

  it('reports a timeout as a timeout, not as a generic network error', async () => {
    const result = await pingIndexNow({
      host: 'example.com',
      key: KEY,
      urls: ['https://example.com/a'],
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })

    expect(result).toMatchObject({ outcome: 'failed', reason: 'timeout' })
  })

  it('does nothing at all when there is no URL to submit', async () => {
    const send = okFetch()
    const result = await pingIndexNow({ host: 'example.com', key: KEY, urls: [], fetch: send })

    expect(result).toEqual({ outcome: 'skipped', reason: 'no-urls' })
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a URL on another host, which the endpoint rejects as a whole batch', async () => {
    await expect(
      pingIndexNow({
        host: 'example.com',
        key: KEY,
        urls: ['https://example.com/a', 'https://elsewhere.test/b'],
        fetch: okFetch(),
      }),
    ).rejects.toThrow(/not on the submitted host/)
  })

  it('refuses a relative URL', async () => {
    await expect(
      pingIndexNow({ host: 'example.com', key: KEY, urls: ['/a'], fetch: okFetch() }),
    ).rejects.toThrow(/not an absolute URL/)
  })

  it('refuses a batch above the documented maximum', async () => {
    const urls = Array.from(
      { length: INDEXNOW_MAX_URLS + 1 },
      (_, index) => `https://example.com/${index}`,
    )

    await expect(
      pingIndexNow({ host: 'example.com', key: KEY, urls, fetch: okFetch() }),
    ).rejects.toThrow(/accepts 10000 URLs per submission/)
  })

  it('refuses a malformed key before opening a socket', async () => {
    const send = okFetch()
    await expect(
      pingIndexNow({
        host: 'example.com',
        key: 'zz',
        urls: ['https://example.com/a'],
        fetch: send,
      }),
    ).rejects.toThrow(/hexadecimal/)
    expect(send).not.toHaveBeenCalled()
  })
})
