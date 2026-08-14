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
})
