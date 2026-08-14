import { describe, expect, it, vi } from 'vitest'
import { queryEpss } from '../../src/security/epss-client.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('queryEpss', () => {
  it('returns an empty map without calling fetch when given no CVE ids', async () => {
    const fetchImpl = vi.fn()
    const scores = await queryEpss([], { fetchImpl })
    expect(scores.size).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('parses EPSS and percentile as numbers, keyed by CVE id', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: [{ cve: 'CVE-2021-23337', epss: '0.02345', percentile: '0.87123' }],
      }),
    )

    const scores = await queryEpss(['CVE-2021-23337'], { fetchImpl })

    expect(scores.get('CVE-2021-23337')).toEqual({
      cve: 'CVE-2021-23337',
      epss: 0.02345,
      percentile: 0.87123,
    })
  })

  it('joins multiple CVE ids into one request', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL) => jsonResponse(200, { data: [] }))

    await queryEpss(['CVE-1', 'CVE-2'], { fetchImpl })

    const url = String(fetchImpl.mock.calls[0]?.[0] ?? '')
    expect(url).toContain('cve=CVE-1,CVE-2')
  })

  it('throws SECURITY_EPSS_QUERY_FAILED when the API responds with an error status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, {}))

    await expect(queryEpss(['CVE-1'], { fetchImpl })).rejects.toThrowError(/failed with status 503/)
  })
})
