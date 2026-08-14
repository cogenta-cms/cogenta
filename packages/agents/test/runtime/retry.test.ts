import { CogentaError } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { retryModelCall, withTimeout } from '../../src/runtime/retry.js'

describe('retryModelCall', () => {
  it('returns the result on the first success without sleeping', async () => {
    const sleep = vi.fn(async () => undefined)
    const fn = vi.fn(async () => 'ok')

    const result = await retryModelCall(fn, { maxAttempts: 3, sleep })

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries a retryable error and succeeds on a later attempt', async () => {
    const sleep = vi.fn(async () => undefined)
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts += 1
      if (attempts < 3) {
        throw new CogentaError({ code: 'PROVIDER_RATE_LIMITED', message: 'rate limited' })
      }
      return 'ok'
    })

    const result = await retryModelCall(fn, { maxAttempts: 3, sleep })

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-retryable error', async () => {
    const sleep = vi.fn(async () => undefined)
    const fn = vi.fn(async () => {
      throw new CogentaError({ code: 'PROVIDER_RESPONSE_INVALID', message: 'malformed' })
    })

    await expect(retryModelCall(fn, { maxAttempts: 3, sleep })).rejects.toThrowError(/malformed/)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('throws the last error once maxAttempts is exhausted', async () => {
    const sleep = vi.fn(async () => undefined)
    const fn = vi.fn(async () => {
      throw new CogentaError({ code: 'PROVIDER_REQUEST_FAILED', message: 'network down' })
    })

    await expect(retryModelCall(fn, { maxAttempts: 2, sleep })).rejects.toThrowError(/network down/)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })
})

describe('withTimeout', () => {
  it('resolves normally when the call finishes before the deadline', async () => {
    const result = await withTimeout(async () => 'ok', 1000)
    expect(result).toBe('ok')
  })

  it('throws PROVIDER_TIMEOUT when the call outlives the deadline', async () => {
    await expect(
      withTimeout(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
        5,
      ),
    ).rejects.toThrowError(/did not respond within/)
  })

  it('propagates the original error when the call fails for a reason other than the timeout', async () => {
    await expect(
      withTimeout(async () => {
        throw new Error('boom')
      }, 1000),
    ).rejects.toThrowError('boom')
  })

  it('propagates cancellation via parentSignal without reporting it as a timeout', async () => {
    const controller = new AbortController()
    const promise = withTimeout(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted by parent')))
        }),
      10_000,
      controller.signal,
    )
    controller.abort()

    await expect(promise).rejects.toThrowError('aborted by parent')
  })
})
