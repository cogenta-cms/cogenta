import { describe, expect, it, vi } from 'vitest'
import { createHttpFetchHandler } from '../../src/host/capabilities.js'
import { runIsolated } from '../../src/host/worker-runner.js'

/**
 * `http.fetch` for a plugin reads a body somebody else controls (pentest
 * 2026-11-01, C-03). It must stop at a size limit and at a deadline while the
 * bytes arrive, and it must stop when the run that asked for it is over —
 * the sandbox timing out says nothing to a request the host already started.
 */

const granted = { grantedCapabilities: ['http.fetch:api.example.com'] }

function endlessBody(stats: { pulled: number; cancelled: boolean }): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        stats.pulled += 1
        controller.enqueue(new Uint8Array(256 * 1024).fill(120))
      },
      cancel() {
        stats.cancelled = true
      },
    }),
    { status: 200 },
  )
}

function stalledBody(stats: { cancelled: boolean }): Response {
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
}

describe('the plugin http.fetch capability, body bounds', () => {
  it('refuses a body that outgrows the limit, without reading the rest of it', async () => {
    const stats = { pulled: 0, cancelled: false }
    const handler = createHttpFetchHandler(
      vi.fn(async () => endlessBody(stats)) as unknown as typeof fetch,
    )

    await expect(handler({ url: 'https://api.example.com/big' }, granted)).rejects.toMatchObject({
      code: 'HTTP_BODY_TOO_LARGE',
    })

    expect(stats.cancelled).toBe(true)
    // 1 MiB is the limit; an unbounded read would never have returned.
    expect(stats.pulled).toBeLessThan(20)
  })

  it('gives up on a body that stalls after its first bytes', async () => {
    const stats = { cancelled: false }
    const handler = createHttpFetchHandler(
      vi.fn(async () => stalledBody(stats)) as unknown as typeof fetch,
      { bodyTimeoutMs: 40 },
    )

    await expect(handler({ url: 'https://api.example.com/slow' }, granted)).rejects.toMatchObject({
      code: 'HTTP_BODY_TIMEOUT',
    })
    expect(stats.cancelled).toBe(true)
  })

  it('hands the run signal to fetch and stops reading when the run is cancelled', async () => {
    const stats = { cancelled: false }
    const seen: (AbortSignal | undefined)[] = []
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined)
      return stalledBody(stats)
    }) as unknown as typeof fetch
    const handler = createHttpFetchHandler(fetchImpl)
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)

    await expect(
      handler({ url: 'https://api.example.com/x' }, { ...granted, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'HTTP_BODY_ABORTED' })

    expect(seen[0]).toBe(controller.signal)
    expect(stats.cancelled).toBe(true)
  })

  it('cancels the request a plugin left running when the plugin itself times out', async () => {
    let signal: AbortSignal | undefined
    const stats = { cancelled: false }
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return stalledBody(stats)
    }) as unknown as typeof fetch

    const result = await runIsolated(`sdk.http.fetch({ url: 'https://api.example.com/x' })`, {
      isolation: 'worker',
      // Long enough for a slow runner (Windows CI) to start the worker and
      // reach the fetch before the deadline; the body never ends, so the run
      // still times out.
      timeoutMs: 3_000,
      grantedCapabilities: ['http.fetch:api.example.com'],
      handlers: { 'http.fetch': createHttpFetchHandler(fetchImpl) },
    })

    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
    // The host propagates the end of the run asynchronously.
    for (
      let waited = 0;
      waited < 2_000 && !(signal?.aborted === true && stats.cancelled);
      waited += 25
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(signal?.aborted).toBe(true)
    expect(stats.cancelled).toBe(true)
  }, 15_000)

  // Pentest 2026-11-01, C-04: a granted *name* is not a granted *address*.
  describe('the default transport', () => {
    it('refuses a granted domain that resolves to a private address, without connecting', async () => {
      const pinnedFetchImpl = vi.fn(async () => new Response('secret'))
      const handler = createHttpFetchHandler(undefined, {
        lookupImpl: (async () => [{ address: '10.0.0.7', family: 4 }]) as never,
        pinnedFetchImpl,
      })

      await expect(handler({ url: 'https://api.example.com/x' }, granted)).rejects.toMatchObject({
        code: 'PLUGIN_CAPABILITY_REFUSED',
      })
      expect(pinnedFetchImpl).not.toHaveBeenCalled()
    })

    it('connects to the address it validated and re-judges a redirect hop', async () => {
      let lookups = 0
      const lookupImpl = (async (host: string) => {
        lookups += 1
        return [{ address: host === 'api.example.com' ? '93.184.216.34' : '127.0.0.1', family: 4 }]
      }) as never
      const connectedTo: string[] = []
      const handler = createHttpFetchHandler(undefined, {
        lookupImpl,
        pinnedFetchImpl: async (target) => {
          connectedTo.push(target.address)
          return new Response(null, {
            status: 302,
            headers: { location: 'https://api.example.com/next' },
          })
        },
      })

      await expect(handler({ url: 'https://api.example.com/x' }, granted)).rejects.toThrow()

      // Each hop is resolved and pinned on its own; the loop ends on the
      // redirect cap, never on a connection to the rebinding answer.
      expect(connectedTo.every((address) => address === '93.184.216.34')).toBe(true)
      expect(lookups).toBeGreaterThan(1)
    })
  })
})
