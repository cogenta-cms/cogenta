import { CogentaError, type RateLimitDriver } from '@cogenta/core'

/**
 * The public submit route's anti-abuse layer (fiche 16 task 3, the same
 * requirements as the fiche's own comments route): a honeypot field, a
 * minimum fill delay, and a per-IP-per-form rate limit — all independent of,
 * and in addition to, `validate.ts`'s server-side field validation.
 */

/** The hidden field name a bot fills and a human, using a real browser, never sees. */
export const HONEYPOT_FIELD = '_gotcha'
/** The hidden timestamp field the public page stamps at render time. */
export const TIMESTAMP_FIELD = '_ts'

const MIN_FILL_MS = 3_000
const MAX_FILL_MS = 24 * 60 * 60 * 1000 // a page open more than a day is stale, not a fast bot — reject rather than trust an ancient timestamp.

export function checkHoneypot(rawValues: Readonly<Record<string, unknown>>): void {
  const value = rawValues[HONEYPOT_FIELD]
  if (typeof value === 'string' && value.trim() !== '') {
    throw new CogentaError({
      code: 'FORM_HONEYPOT_TRIGGERED',
      message: 'This submission was rejected.',
      hint: 'The hidden anti-spam field was filled in — this is a strong signal of an automated submission.',
    })
  }
}

export function checkFillDelay(
  rawValues: Readonly<Record<string, unknown>>,
  now: () => number = Date.now,
): void {
  const raw = rawValues[TIMESTAMP_FIELD]
  const issuedAt = typeof raw === 'string' ? Number(raw) : Number.NaN
  if (!Number.isFinite(issuedAt)) {
    throw new CogentaError({
      code: 'FORM_SUBMITTED_TOO_FAST',
      message: 'This submission was rejected.',
      hint: 'The form page was not loaded normally before this submission arrived.',
    })
  }
  const elapsed = now() - issuedAt
  if (elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) {
    throw new CogentaError({
      code: 'FORM_SUBMITTED_TOO_FAST',
      message: 'This submission was rejected.',
      hint: `A real visitor takes at least ${Math.round(MIN_FILL_MS / 1000)} seconds to fill this form in.`,
    })
  }
}

const SUBMIT_LIMIT = 5
const SUBMIT_WINDOW_MS = 10 * 60 * 1000

/** Per hashed-IP, per form — five submissions per ten minutes. Consumed once the honeypot/timing checks already passed, so a trivially-rejected bot does not burn a real visitor's own quota. */
export async function checkSubmitRateLimit(
  rateLimit: RateLimitDriver,
  formName: string,
  ipHash: string | null,
): Promise<void> {
  const key = `forms:submit:${formName}:${ipHash ?? 'unknown'}`
  const result = await rateLimit.consume(key, { limit: SUBMIT_LIMIT, windowMs: SUBMIT_WINDOW_MS })
  if (!result.allowed) {
    throw new CogentaError({
      code: 'FORM_RATE_LIMITED',
      message: 'Too many submissions from this source. Try again later.',
      hint: `Wait a few minutes before submitting "${formName}" again.`,
      details: { resetAt: result.resetAt },
    })
  }
}
