/**
 * Every default-`false` timeout: none of the three adapters ever bounded a
 * model call on their own — `ChatOptions.signal` only cancels when a caller
 * (the run loop's own cancellation, task 2) supplies one, and the run loop
 * never does for a single chat turn triggered by `POST
 * .../conversation/messages`. Reproduced live: a stalled DeepSeek response
 * left that request (and the browser tab awaiting it) hung for minutes with
 * no error, nothing in the server log, and no way to recover short of
 * killing the process. This is the floor every adapter now falls back to
 * when the caller supplies no signal of its own — a stalled vendor fails
 * with a named error instead of hanging the caller forever.
 */
export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 180_000

/**
 * The caller's own signal (if any) combined with a timeout floor, so a
 * cancellation the run loop already wants (budget exceeded, kill switch)
 * still works exactly as before, and an otherwise-uncancelled call still
 * gives up eventually. `timeoutMs` defaults to the real floor above —
 * overridable only so a test can prove the behaviour without a real
 * two-minute wait.
 */
export function requestSignalWithTimeout(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal])
}
