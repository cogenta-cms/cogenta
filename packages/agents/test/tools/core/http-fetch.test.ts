import { describe, expect, it, vi } from 'vitest'
import { createHttpFetchTool } from '../../../src/tools/core/http-fetch.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:security', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('http.fetch', () => {
  it('fetches an allowed domain and returns status/headers/body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }))
    const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })

    const result = await tool.execute({ url: 'https://api.example.com/status' }, CTX)

    expect(result.status).toBe(200)
    expect(result.body).toBe('{"ok":true}')
    expect(result.headers['content-type']).toContain('application/json')
  })

  it('refuses a domain that is not on the allowlist, without calling fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}))
    const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })

    await expect(tool.execute({ url: 'https://evil.example/steal' }, CTX)).rejects.toThrowError(
      /"evil.example" is not in this agent's allowed domain list/,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('defaults to GET and forwards an explicit HEAD', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}))
    const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })

    await tool.execute({ url: 'https://api.example.com/x', method: 'HEAD' }, CTX)

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.method).toBe('HEAD')
  })

  it('truncates a body longer than the configured maximum', async () => {
    const huge = 'x'.repeat(100_050)
    const fetchImpl = vi.fn(
      async () => new Response(huge, { status: 200, headers: { 'content-type': 'text/plain' } }),
    )
    const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })

    const result = await tool.execute({ url: 'https://api.example.com/big' }, CTX)

    expect(result.body.length).toBe(100_001)
    expect(result.body.endsWith('…')).toBe(true)
  })

  it('threads the run signal into the fetch call', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}))
    const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })

    await tool.execute({ url: 'https://api.example.com/x' }, CTX)

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.signal).toBe(CTX.signal)
  })

  it('restricts an own-site fetch to the exact origin and never follows redirects implicitly', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }),
    )
    const tool = createHttpFetchTool({
      allowedDomains: ['site.example'],
      allowedOrigins: ['https://site.example'],
      fetchImpl,
    })
    for (const url of [
      'http://site.example/',
      'https://site.example:444/',
      'https://name:password@site.example/',
    ]) {
      await expect(tool.execute({ url }, CTX)).rejects.toMatchObject({
        code: 'HTTP_FETCH_DOMAIN_DENIED',
      })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    const result = await tool.execute({ url: 'https://site.example/' }, CTX)
    expect(result.status).toBe(302)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.redirect).toBe('manual')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  // Pentest 2026-11-01, C-03: the text was read in full and cut afterwards, so
  // the cap bounded what the model saw and nothing about what the host held.
  describe('a response body that is large or slow', () => {
    it('stops reading an endless body at the limit and cancels the stream', async () => {
      const stats = { pulled: 0, cancelled: false }
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                stats.pulled += 1
                controller.enqueue(new Uint8Array(64 * 1024).fill(120))
              },
              cancel() {
                stats.cancelled = true
              },
            }),
            { status: 200, headers: { 'content-type': 'text/plain' } },
          ),
      )
      const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })

      const result = await tool.execute({ url: 'https://api.example.com/endless' }, CTX)

      expect(result.body.length).toBe(100_001)
      expect(result.body.endsWith('…')).toBe(true)
      expect(stats.cancelled).toBe(true)
      // 100 000 characters need a few hundred KiB at most, not a stream's worth.
      expect(stats.pulled).toBeLessThan(30)
    })

    it('gives up on a body that stalls after its first bytes', async () => {
      const stats = { cancelled: false }
      const fetchImpl = vi.fn(async () => {
        let sent = false
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!sent) {
                sent = true
                controller.enqueue(new TextEncoder().encode('partial'))
                return
              }
              return new Promise<void>(() => undefined)
            },
            cancel() {
              stats.cancelled = true
            },
          }),
          { status: 200 },
        )
      })
      const tool = createHttpFetchTool({
        allowedDomains: ['api.example.com'],
        fetchImpl,
        bodyTimeoutMs: 40,
      })

      await expect(
        tool.execute({ url: 'https://api.example.com/slow' }, CTX),
      ).rejects.toMatchObject({ code: 'HTTP_BODY_TIMEOUT' })
      expect(stats.cancelled).toBe(true)
    })

    it('stops when the run is cancelled while the server is silent', async () => {
      const controller = new AbortController()
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull: () => new Promise<void>(() => undefined),
            }),
            { status: 200 },
          ),
      )
      const tool = createHttpFetchTool({ allowedDomains: ['api.example.com'], fetchImpl })
      setTimeout(() => controller.abort(), 20)

      await expect(
        tool.execute(
          { url: 'https://api.example.com/silent' },
          { ...CTX, signal: controller.signal },
        ),
      ).rejects.toMatchObject({ code: 'HTTP_BODY_ABORTED' })
    })
  })

  // Pentest 2026-11-01, C-04: an allowed *name* is not an allowed *address*.
  describe('the default transport', () => {
    const publicLookup = (async () => [{ address: '93.184.216.34', family: 4 }]) as never

    it.each([
      ['127.0.0.1', '127.0.0.1'],
      ['10.1.2.3', '10.1.2.3'],
      ['fe90::1', '[fe90::1]'],
    ])(
      'refuses an allowed domain that resolves to %s, without connecting',
      async (address, host) => {
        const pinnedFetchImpl = vi.fn(async () => new Response('secret'))
        const tool = createHttpFetchTool({
          allowedDomains: ['intranet.example.com'],
          lookupImpl: (async () => [{ address, family: host.startsWith('[') ? 6 : 4 }]) as never,
          pinnedFetchImpl,
        })

        await expect(
          tool.execute({ url: 'https://intranet.example.com/admin' }, CTX),
        ).rejects.toMatchObject({ code: 'HTTP_FETCH_DOMAIN_DENIED' })
        expect(pinnedFetchImpl).not.toHaveBeenCalled()
      },
    )

    it('refuses an allowed literal metadata address', async () => {
      const pinnedFetchImpl = vi.fn(async () => new Response('secret'))
      const tool = createHttpFetchTool({
        allowedDomains: ['169.254.169.254'],
        pinnedFetchImpl,
      })

      await expect(
        tool.execute({ url: 'http://169.254.169.254/latest/meta-data/' }, CTX),
      ).rejects.toMatchObject({ code: 'HTTP_FETCH_DOMAIN_DENIED' })
      expect(pinnedFetchImpl).not.toHaveBeenCalled()
    })

    it('connects to the address it validated, resolving the name once', async () => {
      let lookups = 0
      const lookupImpl = (async () => {
        lookups += 1
        return [{ address: lookups === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }]
      }) as never
      const connectedTo: string[] = []
      const tool = createHttpFetchTool({
        allowedDomains: ['api.example.com'],
        lookupImpl,
        pinnedFetchImpl: async (target) => {
          connectedTo.push(target.address)
          return new Response('ok', { status: 200 })
        },
      })

      const result = await tool.execute({ url: 'https://api.example.com/x' }, CTX)

      expect(result.body).toBe('ok')
      expect(connectedTo).toEqual(['93.184.216.34'])
      expect(lookups).toBe(1)
    })

    it('does not follow a redirect into a private address', async () => {
      const tool = createHttpFetchTool({
        allowedDomains: ['api.example.com'],
        lookupImpl: publicLookup,
        pinnedFetchImpl: async () =>
          new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
      })

      const result = await tool.execute({ url: 'https://api.example.com/x' }, CTX)

      expect(result.status).toBe(302)
    })
  })
})
