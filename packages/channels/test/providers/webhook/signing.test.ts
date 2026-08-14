import { describe, expect, it } from 'vitest'
import {
  assertValidIncomingWebhook,
  signOutgoingWebhook,
  verifyIncomingWebhook,
  WebhookReplayGuard,
} from '../../../src/providers/webhook/signing.js'

const SECRET = 'shared-webhook-secret'

describe('signOutgoingWebhook / verifyIncomingWebhook', () => {
  it('accepts a genuinely valid, fresh, unreplayed request', () => {
    const now = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook(SECRET, body, now)

    const result = verifyIncomingWebhook({
      headers: signed,
      rawBody: body,
      secret: SECRET,
      now,
    })

    expect(result).toEqual({ ok: true })
  })

  it('rejects a tampered signature', () => {
    const now = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook(SECRET, body, now)

    const result = verifyIncomingWebhook({
      headers: { ...signed, signature: `${signed.signature.slice(0, -1)}0` },
      rawBody: body,
      secret: SECRET,
      now,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a body that was mutated after signing', () => {
    const now = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook(SECRET, body, now)

    const result = verifyIncomingWebhook({
      headers: signed,
      rawBody: JSON.stringify({ hello: 'tampered' }),
      secret: SECRET,
      now,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a request signed with the wrong secret', () => {
    const now = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook('a-different-secret', body, now)

    const result = verifyIncomingWebhook({
      headers: signed,
      rawBody: body,
      secret: SECRET,
      now,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a valid signature outside the freshness window', () => {
    const signedAt = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook(SECRET, body, signedAt)

    const result = verifyIncomingWebhook({
      headers: signed,
      rawBody: body,
      secret: SECRET,
      now: signedAt + 5 * 60 + 1,
      freshnessWindowSeconds: 5 * 60,
    })

    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts a valid signature right at the edge of the freshness window', () => {
    const signedAt = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook(SECRET, body, signedAt)

    const result = verifyIncomingWebhook({
      headers: signed,
      rawBody: body,
      secret: SECRET,
      now: signedAt + 5 * 60,
      freshnessWindowSeconds: 5 * 60,
    })

    expect(result).toEqual({ ok: true })
  })

  it('rejects a malformed, non-numeric timestamp', () => {
    const body = JSON.stringify({ hello: 'world' })

    const result = verifyIncomingWebhook({
      headers: { timestamp: 'not-a-number', signature: 'whatever' },
      rawBody: body,
      secret: SECRET,
      now: 1_000_000,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a replayed request when a replay guard is supplied', () => {
    const now = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const signed = signOutgoingWebhook(SECRET, body, now)
    const guard = new WebhookReplayGuard()

    const first = verifyIncomingWebhook({
      headers: signed,
      rawBody: body,
      secret: SECRET,
      now,
      replayGuard: guard,
    })
    const second = verifyIncomingWebhook({
      headers: signed,
      rawBody: body,
      secret: SECRET,
      now: now + 1,
      replayGuard: guard,
    })

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: false, reason: 'replayed' })
  })

  it('does not consult the replay guard when the signature is invalid, so garbage cannot exhaust it', () => {
    const now = 1_000_000
    const body = JSON.stringify({ hello: 'world' })
    const guard = new WebhookReplayGuard()

    const result = verifyIncomingWebhook({
      headers: { timestamp: String(now), signature: 'entirely-fabricated' },
      rawBody: body,
      secret: SECRET,
      now,
      replayGuard: guard,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
    // The same fabricated signature, now claimed genuine, must still fail on
    // its own merits rather than being remembered as "already seen".
    expect(guard.hasSeen('entirely-fabricated', now, 300)).toBe(false)
  })

  it('allows an identical signature to be reused again once outside the freshness window', () => {
    const now = 1_000_000
    const guard = new WebhookReplayGuard()
    guard.remember('sig', now)

    expect(guard.hasSeen('sig', now + 301, 300)).toBe(false)
  })
})

describe('assertValidIncomingWebhook', () => {
  it('is a no-op on a valid result', () => {
    expect(() => assertValidIncomingWebhook({ ok: true })).not.toThrow()
  })

  it.each([
    ['invalid_signature', 'CHANNEL_WEBHOOK_SIGNATURE_INVALID'],
    ['expired', 'CHANNEL_WEBHOOK_EXPIRED'],
    ['replayed', 'CHANNEL_WEBHOOK_REPLAY_DETECTED'],
  ] as const)('throws the typed error matching reason "%s"', (reason, code) => {
    try {
      assertValidIncomingWebhook({ ok: false, reason })
      expect.unreachable('expected assertValidIncomingWebhook to throw')
    } catch (error) {
      expect((error as { code?: string }).code).toBe(code)
    }
  })
})
