import { describe, expect, it } from 'vitest'
import { requestSignalWithTimeout } from '../../src/providers/request-signal.js'

/**
 * Reproduced live (2026-09-02): a stalled DeepSeek call left a chat request
 * hanging for minutes with nothing logged and no way to recover short of
 * killing the server — none of the three provider adapters ever bounded a
 * call on their own. These pin the floor `requestSignalWithTimeout` adds.
 */
describe('requestSignalWithTimeout', () => {
  it('is not aborted immediately, with or without a caller signal', () => {
    expect(requestSignalWithTimeout(undefined, 10_000).aborted).toBe(false)
    expect(requestSignalWithTimeout(new AbortController().signal, 10_000).aborted).toBe(false)
  })

  it('aborts on its own once the timeout elapses, with no caller signal', async () => {
    const signal = requestSignalWithTimeout(undefined, 5)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(signal.aborted).toBe(true)
  })

  it('aborts once the timeout elapses even with a caller signal that never fires', async () => {
    const caller = new AbortController()
    const signal = requestSignalWithTimeout(caller.signal, 5)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(signal.aborted).toBe(true)
    expect(caller.signal.aborted).toBe(false)
  })

  it('aborts immediately when the caller signal is already aborted, timeout notwithstanding', () => {
    const caller = new AbortController()
    caller.abort()
    expect(requestSignalWithTimeout(caller.signal, 10_000).aborted).toBe(true)
  })

  it('aborts when the caller cancels, well before the timeout', async () => {
    const caller = new AbortController()
    const signal = requestSignalWithTimeout(caller.signal, 10_000)
    caller.abort()
    await Promise.resolve()
    expect(signal.aborted).toBe(true)
  })
})
