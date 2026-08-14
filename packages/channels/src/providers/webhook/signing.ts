import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError } from '@cogenta/core'

/**
 * "Les webhooks entrants sont une surface d'attaque. Vérification de
 * signature obligatoire, fenêtre temporelle, protection contre le rejeu. Un
 * webhook non signé est un endpoint public arbitraire." (L6, "## Pièges
 * connus"). This module is the whole reason L6 task 11 exists as its own
 * deliverable — three checks, all mandatory: signature authenticity,
 * timestamp freshness, and replay rejection.
 *
 * Same HMAC-SHA256 + constant-time-comparison construction as
 * `approvals/signed-link.ts` (itself mirroring `StorageDriver.signedUrl`) —
 * signs `timestamp + '.' + rawBody` rather than the body alone, so a replayed
 * request with an old, otherwise-valid signature still fails freshness.
 */

const DEFAULT_FRESHNESS_WINDOW_SECONDS = 5 * 60

export interface SignedWebhookRequest {
  readonly timestamp: string
  readonly signature: string
}

/** The two headers an outbound signed webhook carries; a receiver names them however it configures its route. */
export const WEBHOOK_TIMESTAMP_HEADER = 'X-Cogenta-Timestamp'
export const WEBHOOK_SIGNATURE_HEADER = 'X-Cogenta-Signature'

function signPayload(secret: string, timestampSeconds: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')
}

/** The outbound half: what `createWebhookAdapter`'s `send()` attaches to every request. */
export function signOutgoingWebhook(
  secret: string,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignedWebhookRequest {
  const timestamp = String(nowSeconds)
  return { timestamp, signature: signPayload(secret, nowSeconds, rawBody) }
}

export type WebhookVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'invalid_signature' | 'expired' | 'replayed' }

/**
 * Bounded, in-memory replay guard — proportionate to the freshness window a
 * verifier already enforces (an entry older than the window can never pass
 * freshness anyway, so nothing needs to be remembered past it). Not a
 * general-purpose dedup store; one instance per verifying process/secret is
 * the expected usage, matching how a route handler would own it.
 */
export class WebhookReplayGuard {
  readonly #seenAtBySignature = new Map<string, number>()

  /** Returns `true` if `signature` was already recorded within a still-valid window. */
  hasSeen(signature: string, nowSeconds: number, freshnessWindowSeconds: number): boolean {
    this.#purgeExpired(nowSeconds, freshnessWindowSeconds)
    return this.#seenAtBySignature.has(signature)
  }

  remember(signature: string, nowSeconds: number): void {
    this.#seenAtBySignature.set(signature, nowSeconds)
  }

  #purgeExpired(nowSeconds: number, freshnessWindowSeconds: number): void {
    for (const [signature, seenAt] of this.#seenAtBySignature) {
      if (nowSeconds - seenAt > freshnessWindowSeconds) this.#seenAtBySignature.delete(signature)
    }
  }
}

export interface VerifyIncomingWebhookInput {
  readonly headers: SignedWebhookRequest
  readonly rawBody: string
  readonly secret: string
  readonly now?: number
  readonly freshnessWindowSeconds?: number
  /** Omit to skip replay checking (e.g. a caller that already dedupes upstream). */
  readonly replayGuard?: WebhookReplayGuard
}

/**
 * Three independent checks, all mandatory, in the order that fails cheapest
 * first: a malformed/non-numeric timestamp or a stale one is rejected before
 * ever computing an HMAC over it, and only a request that is both fresh and
 * authentic is checked for replay (recording a signature for a request that
 * never even had a valid signature would let an attacker exhaust the replay
 * guard with garbage).
 *
 * Unlike `linking/codes.ts`'s deliberately uniform `CHANNEL_LINK_CODE_INVALID`
 * (chosen to deny an attacker an enumeration oracle over *which accounts
 * exist*), this returns a *distinguishable* reason. There is no identity to
 * enumerate here — a webhook secret is either configured correctly or it
 * isn't, and telling an operator debugging a misconfigured integration
 * "your signature doesn't match" versus "your timestamp is stale" versus
 * "this exact request was already processed" is a legitimate operational
 * need, not an attack surface: none of the three reasons reveal anything an
 * attacker couldn't already infer from a generic 401.
 */
export function verifyIncomingWebhook(
  input: VerifyIncomingWebhookInput,
): WebhookVerificationResult {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const freshnessWindowSeconds = input.freshnessWindowSeconds ?? DEFAULT_FRESHNESS_WINDOW_SECONDS

  const timestampSeconds = Number(input.headers.timestamp)
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: 'invalid_signature' }
  if (Math.abs(now - timestampSeconds) > freshnessWindowSeconds) {
    return { ok: false, reason: 'expired' }
  }

  const expected = Buffer.from(signPayload(input.secret, timestampSeconds, input.rawBody), 'utf8')
  const received = Buffer.from(input.headers.signature, 'utf8')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  if (input.replayGuard !== undefined) {
    if (input.replayGuard.hasSeen(input.headers.signature, now, freshnessWindowSeconds)) {
      return { ok: false, reason: 'replayed' }
    }
    input.replayGuard.remember(input.headers.signature, now)
  }

  return { ok: true }
}

const REASON_TO_ERROR_CODE = {
  invalid_signature: 'CHANNEL_WEBHOOK_SIGNATURE_INVALID',
  expired: 'CHANNEL_WEBHOOK_EXPIRED',
  replayed: 'CHANNEL_WEBHOOK_REPLAY_DETECTED',
} as const

/** Throws the typed `CogentaError` matching a failed `verifyIncomingWebhook` result; a no-op on success. */
export function assertValidIncomingWebhook(result: WebhookVerificationResult): void {
  if (result.ok) return
  const code = REASON_TO_ERROR_CODE[result.reason]
  throw new CogentaError({
    code,
    message: `Incoming webhook rejected: ${result.reason}.`,
    hint: 'Check the shared secret, clock skew between sender and receiver, and that this exact request has not already been delivered.',
  })
}
