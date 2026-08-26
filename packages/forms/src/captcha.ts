import { CogentaError } from '@cogenta/core'
import type { FormCaptchaConfig } from './types.js'

/**
 * Fiche 47 task 10 — Turnstile verification: one HTTP call to Cloudflare's
 * siteverify endpoint, zero client SDK dependency (R9). Never on by default
 * (`FormCaptchaConfig.enabled`) — an admin opts a specific form into it,
 * trading "works with no JavaScript at all" for that one form's submit step
 * only (Turnstile's widget itself requires script execution; nothing else
 * on this form does).
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type CaptchaFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ readonly ok: boolean; readonly json: () => Promise<unknown> }>

export interface VerifyCaptchaOptions {
  readonly captcha: FormCaptchaConfig
  readonly token: string | undefined
  readonly remoteIp?: string | null
  readonly fetchImpl?: CaptchaFetch
}

function captchaRequired(): CogentaError {
  return new CogentaError({
    code: 'FORM_CAPTCHA_REQUIRED',
    message: 'This form requires completing the CAPTCHA before it can be submitted.',
    hint: 'Complete the CAPTCHA challenge and submit again.',
  })
}

function captchaFailed(reason: string): CogentaError {
  return new CogentaError({
    code: 'FORM_CAPTCHA_FAILED',
    message: `The CAPTCHA could not be verified: ${reason}.`,
    hint: 'Try submitting the form again.',
  })
}

/** No-op when the form has no CAPTCHA enabled — the common case (R2/R1: nothing here requires an external service unless an operator explicitly opted a form in). */
export async function verifyCaptcha(options: VerifyCaptchaOptions): Promise<void> {
  const { captcha } = options
  if (!captcha.enabled) return

  if (captcha.secretKey === undefined || captcha.secretKey.trim() === '') {
    // A form marked "CAPTCHA enabled" with no secret configured is a
    // misconfiguration, not a reason to silently let every submission
    // through — that would be the CAPTCHA equivalent of a permission check
    // that fails open.
    throw captchaFailed('this form has no CAPTCHA secret configured')
  }

  if (options.token === undefined || options.token.trim() === '') {
    throw captchaRequired()
  }

  const fetchImpl = options.fetchImpl ?? (fetch as unknown as CaptchaFetch)
  const body = new URLSearchParams({ secret: captcha.secretKey, response: options.token })
  if (options.remoteIp !== undefined && options.remoteIp !== null && options.remoteIp !== '') {
    body.set('remoteip', options.remoteIp)
  }

  let response: { readonly ok: boolean; readonly json: () => Promise<unknown> }
  try {
    response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    throw captchaFailed('the verification service could not be reached')
  }

  if (!response.ok) throw captchaFailed('the verification service returned an error')

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw captchaFailed('the verification service returned an unreadable response')
  }

  const success =
    typeof payload === 'object' && payload !== null && (payload as { success?: unknown }).success

  if (success !== true) throw captchaFailed('the challenge response was rejected')
}
