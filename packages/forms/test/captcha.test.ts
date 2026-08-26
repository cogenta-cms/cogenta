import { describe, expect, it } from 'vitest'
import { type CaptchaFetch, verifyCaptcha } from '../src/captcha.js'
import type { FormCaptchaConfig } from '../src/types.js'

/**
 * Fiche 47 task 10 — Turnstile verification. "Un CAPTCHA ne doit jamais
 * devenir obligatoire par défaut" is checked first: `enabled: false` (the
 * shape every form has unless an admin opts in) never calls the network at
 * all, R1/R2-honest.
 */

function fetchThatAnswers(payload: unknown, ok = true): CaptchaFetch {
  return async () => ({ ok, json: async () => payload })
}

describe('verifyCaptcha', () => {
  it('does nothing, and calls no network, when the form has no CAPTCHA enabled', async () => {
    let called = false
    const fetchImpl: CaptchaFetch = async () => {
      called = true
      return { ok: true, json: async () => ({ success: true }) }
    }
    await verifyCaptcha({ captcha: { enabled: false }, token: undefined, fetchImpl })
    expect(called).toBe(false)
  })

  it('requires a token once the CAPTCHA is enabled', async () => {
    const captcha: FormCaptchaConfig = { enabled: true, siteKey: 'site', secretKey: 'secret' }
    await expect(
      verifyCaptcha({ captcha, token: undefined, fetchImpl: fetchThatAnswers({ success: true }) }),
    ).rejects.toMatchObject({ code: 'FORM_CAPTCHA_REQUIRED' })
  })

  it('refuses to silently pass when enabled with no secret configured — a misconfiguration must not fail open', async () => {
    const captcha: FormCaptchaConfig = { enabled: true, siteKey: 'site' }
    await expect(
      verifyCaptcha({
        captcha,
        token: 'a-token',
        fetchImpl: fetchThatAnswers({ success: true }),
      }),
    ).rejects.toMatchObject({ code: 'FORM_CAPTCHA_FAILED' })
  })

  it('passes when the verification service confirms success', async () => {
    const captcha: FormCaptchaConfig = { enabled: true, siteKey: 'site', secretKey: 'secret' }
    await expect(
      verifyCaptcha({
        captcha,
        token: 'a-token',
        fetchImpl: fetchThatAnswers({ success: true }),
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects when the verification service reports failure', async () => {
    const captcha: FormCaptchaConfig = { enabled: true, siteKey: 'site', secretKey: 'secret' }
    await expect(
      verifyCaptcha({
        captcha,
        token: 'a-token',
        fetchImpl: fetchThatAnswers({ success: false, 'error-codes': ['invalid-input-response'] }),
      }),
    ).rejects.toMatchObject({ code: 'FORM_CAPTCHA_FAILED' })
  })

  it('rejects when the verification service itself is unreachable', async () => {
    const captcha: FormCaptchaConfig = { enabled: true, siteKey: 'site', secretKey: 'secret' }
    const fetchImpl: CaptchaFetch = async () => {
      throw new Error('network down')
    }
    await expect(verifyCaptcha({ captcha, token: 'a-token', fetchImpl })).rejects.toMatchObject({
      code: 'FORM_CAPTCHA_FAILED',
    })
  })
})
