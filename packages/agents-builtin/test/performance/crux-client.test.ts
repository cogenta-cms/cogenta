import { describe, expect, it, vi } from 'vitest'
import { queryCrux } from '../../src/performance/crux-client.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('queryCrux', () => {
  it('returns empty metrics for a 404 (no CrUX data), without throwing', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(404, {}),
    )

    const metrics = await queryCrux('https://example.com', { apiKey: 'key', fetchImpl })

    expect(metrics).toEqual({})
  })

  it('extracts p75 for every metric present in the response', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        record: {
          metrics: {
            largest_contentful_paint: { percentiles: { p75: 2100 } },
            cumulative_layout_shift: { percentiles: { p75: 0.08 } },
            interaction_to_next_paint: { percentiles: { p75: 180 } },
            experimental_time_to_first_byte: { percentiles: { p75: 600 } },
          },
        },
      }),
    )

    const metrics = await queryCrux('https://example.com', { apiKey: 'key', fetchImpl })

    expect(metrics).toEqual({ lcpP75Ms: 2100, clsP75: 0.08, inpP75Ms: 180, ttfbP75Ms: 600 })
  })

  it('omits a metric CrUX has no data for, rather than defaulting it', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2100 } } } },
      }),
    )

    const metrics = await queryCrux('https://example.com', { apiKey: 'key', fetchImpl })

    expect(metrics).toEqual({ lcpP75Ms: 2100 })
  })

  it('puts the API key in the query string and never in a header', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(200, { record: { metrics: {} } }),
    )

    await queryCrux('https://example.com', { apiKey: 'secret-key', fetchImpl })

    const calledUrl = String(fetchImpl.mock.calls[0]?.[0] ?? '')
    expect(calledUrl).toContain('key=secret-key')
  })

  it('throws PERFORMANCE_CRUX_QUERY_FAILED for a non-404 error status', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(500, {}),
    )

    await expect(
      queryCrux('https://example.com', { apiKey: 'key', fetchImpl }),
    ).rejects.toThrowError(/failed with status 500/)
  })

  it('sends the requested form factor', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(200, { record: { metrics: {} } }),
    )

    await queryCrux('https://example.com', { apiKey: 'key', fetchImpl, formFactor: 'DESKTOP' })

    const init = fetchImpl.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body ?? '{}'))
    expect(body.formFactor).toBe('DESKTOP')
  })
})
