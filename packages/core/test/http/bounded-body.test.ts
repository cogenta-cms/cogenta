import { describe, expect, it } from 'vitest'
import { readBoundedBody, readBoundedText } from '../../src/http/index.js'

/** A body that hands out `chunks` one per pull and records what happened to it. */
function streamOf(chunks: readonly Uint8Array[]): {
  readonly response: Response
  readonly stats: { pulled: number; cancelled: boolean }
} {
  const stats = { pulled: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[stats.pulled]
      stats.pulled += 1
      if (next === undefined) controller.close()
      else controller.enqueue(next)
    },
    cancel() {
      stats.cancelled = true
    },
  })
  return { response: new Response(body), stats }
}

/** A body that never delivers a byte after its first chunk. */
function stalledStream(first: Uint8Array): {
  readonly response: Response
  readonly stats: { cancelled: boolean }
} {
  const stats = { cancelled: false }
  let sent = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true
        controller.enqueue(first)
        return
      }
      return new Promise<void>(() => undefined)
    },
    cancel() {
      stats.cancelled = true
    },
  })
  return { response: new Response(body), stats }
}

const kib = (n: number): Uint8Array => new Uint8Array(n * 1024).fill(97)

describe('readBoundedBody', () => {
  it('returns the whole body when it fits', async () => {
    const { response } = streamOf([kib(1), kib(1)])

    const read = await readBoundedBody(response, { maxBytes: 4096, onLimit: 'throw' })

    expect(read.bytes.byteLength).toBe(2048)
    expect(read.truncated).toBe(false)
  })

  it('accepts a body of exactly the limit', async () => {
    const { response } = streamOf([kib(1)])

    const read = await readBoundedBody(response, { maxBytes: 1024, onLimit: 'throw' })

    expect(read.bytes.byteLength).toBe(1024)
  })

  it('stops pulling and cancels the stream once a body without Content-Length passes the limit', async () => {
    // Endless: a reader that waited for the end would never return.
    const stats = { pulled: 0, cancelled: false }
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        stats.pulled += 1
        controller.enqueue(kib(1))
      },
      cancel() {
        stats.cancelled = true
      },
    })

    await expect(
      readBoundedBody(new Response(body), { maxBytes: 4096, onLimit: 'throw' }),
    ).rejects.toMatchObject({ code: 'HTTP_BODY_TOO_LARGE' })

    expect(stats.cancelled).toBe(true)
    // A handful of chunks past the limit at most (the stream pre-fills its
    // queue), never the unbounded amount a full read would have asked for.
    expect(stats.pulled).toBeLessThan(10)
  })

  it('keeps the first maxBytes and says so when asked to truncate', async () => {
    const { response, stats } = streamOf([kib(3), kib(3), kib(3)])

    const read = await readBoundedBody(response, { maxBytes: 4096, onLimit: 'truncate' })

    expect(read.bytes.byteLength).toBe(4096)
    expect(read.truncated).toBe(true)
    expect(stats.cancelled).toBe(true)
  })

  it('gives up on a body that stalls after its first bytes, and cancels it', async () => {
    const { response, stats } = stalledStream(kib(1))

    await expect(
      readBoundedBody(response, { maxBytes: 4096, onLimit: 'throw', timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: 'HTTP_BODY_TIMEOUT' })

    expect(stats.cancelled).toBe(true)
  })

  it('honours the caller cancelling while the remote end is silent', async () => {
    const { response, stats } = stalledStream(kib(1))
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)

    await expect(
      readBoundedBody(response, { maxBytes: 4096, onLimit: 'throw', signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'HTTP_BODY_ABORTED' })

    expect(stats.cancelled).toBe(true)
  })

  it('refuses to start when the caller already cancelled', async () => {
    const { response, stats } = streamOf([kib(1)])
    const controller = new AbortController()
    controller.abort()

    await expect(
      readBoundedBody(response, { maxBytes: 4096, onLimit: 'throw', signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'HTTP_BODY_ABORTED' })

    expect(stats.cancelled).toBe(true)
  })

  it('decodes text and reports truncation through readBoundedText', async () => {
    const { response } = streamOf([new TextEncoder().encode('héllo wörld')])

    const read = await readBoundedText(response, { maxBytes: 1024, onLimit: 'truncate' })

    expect(read).toEqual({ text: 'héllo wörld', truncated: false })
  })
})
