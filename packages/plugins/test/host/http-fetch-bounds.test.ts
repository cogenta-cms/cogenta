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
      timeoutMs: 400,
      grantedCapabilities: ['http.fetch:api.example.com'],
      handlers: { 'http.fetch': createHttpFetchHandler(fetchImpl) },
    })

    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
    // Give the host a tick to propagate the end of the run.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(signal?.aborted).toBe(true)
    expect(stats.cancelled).toBe(true)
  })
})
