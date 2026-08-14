import { CogentaError } from '@cogenta/core'

const RETRYABLE_CODES = new Set([
  'PROVIDER_REQUEST_FAILED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',
])

export interface RetryOptions {
  readonly maxAttempts: number
  /** Exponential backoff, 250ms base — injectable so tests never actually sleep. */
  readonly delayMs?: (attempt: number) => number
  readonly sleep?: (ms: number) => Promise<void>
}

const DEFAULT_DELAY = (attempt: number): number => 250 * 2 ** attempt
const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retries only what a retry can plausibly fix: a dropped connection, a rate
 * limit, a timeout. `PROVIDER_RESPONSE_INVALID` (a malformed vendor payload)
 * and everything else is not retried — a second identical request against
 * the same malformed state just wastes a call and a budget unit.
 */
export async function retryModelCall<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY
  const sleep = options.sleep ?? DEFAULT_SLEEP
  let lastError: unknown

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const retryable = error instanceof CogentaError && RETRYABLE_CODES.has(error.code)
      if (!retryable || attempt === options.maxAttempts - 1) throw error
      await sleep(delayMs(attempt))
    }
  }
  // Unreachable when maxAttempts >= 1 (the loop above always returns or throws),
  // kept only so the function has a total return type.
  throw lastError
}

/**
 * Races a model call against a timeout, distinguishing three outcomes: the
 * call resolved, it was cancelled by `parentSignal` (the run's own
 * cancellation, handled by the loop, not thrown as a timeout), or it timed
 * out (thrown as `PROVIDER_TIMEOUT`, which `retryModelCall` treats as
 * retryable).
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const onParentAbort = (): void => controller.abort()
  parentSignal?.addEventListener('abort', onParentAbort)
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fn(controller.signal)
  } catch (error) {
    if (timedOut) {
      throw new CogentaError({
        code: 'PROVIDER_TIMEOUT',
        message: `The model call did not respond within ${timeoutMs}ms.`,
        hint: 'Increase timeoutMs for this agent, or check the provider status page.',
      })
    }
    throw error
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }
}
