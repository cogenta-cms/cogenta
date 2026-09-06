/**
 * The caller's own signal (if any) combined with a timeout floor, so a
 * cancellation the run loop already wants (budget exceeded, kill switch)
 * still works exactly as before, and an otherwise-uncancelled call still
 * gives up eventually.
 *
 * `timeoutMs` is required — every real caller (the three provider adapters)
 * always resolves a concrete `requestTimeoutMs` before calling this
 * (`ProviderClient.requestTimeoutMs`, itself always a number: the admin's
 * per-provider override or the site-wide `assistant.defaultRequestTimeoutSeconds`
 * floor, `SITE_SETTINGS_REGISTRY` in `@cogenta/schema`). This function used
 * to default it to a `DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS` constant — fiche
 * feedback: that hid a real site behaviour (what happens when a call to a
 * stalled vendor never returns — reproduced live once, see the changeset
 * history) behind a number nothing but this file's own comment ever named.
 */
export function requestSignalWithTimeout(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal])
}
