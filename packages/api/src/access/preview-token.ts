import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError } from '@cogenta/core'
import type { PreviewGrant } from '../types.js'

/**
 * Preview tokens: the one sanctioned way an unauthenticated visitor reads an
 * entry that is not published.
 *
 * A token grants exactly one entry of one collection, and it expires. It is
 * signed, never encrypted: it carries no secret, only three facts that the
 * signature makes unforgeable. The pattern is the one already used by the local
 * storage driver's signed URLs — HMAC-SHA256, constant-time comparison.
 */

/** Environment variable holding the HMAC key. Never a config file (rule R7). */
export const PREVIEW_SIGNING_KEY_ENV = 'COGENTA_PREVIEW_SIGNING_KEY'

/**
 * Shortest key accepted. Below this an HMAC key is guessable, and a guessable
 * key turns every draft of the site into public content.
 *
 * Exported (fiche 40 task 4) so `cogenta doctor`'s own check compares against
 * the exact same number this module enforces, rather than a second `32`
 * copied by hand that could silently drift from it.
 */
export const PREVIEW_SIGNING_KEY_MINIMUM_LENGTH = 32

/**
 * Longest lifetime a token may be issued for. A preview link is shared in a
 * chat message and forgotten there; one that never expires is a permanent hole
 * in the draft rule. Callers that need longer should re-issue.
 */
export const MAX_PREVIEW_LIFETIME_SECONDS = 7 * 24 * 60 * 60

const TOKEN_VERSION = 'v1'

export interface PreviewTokenOptions {
  /**
   * The HMAC key. Defaults to `COGENTA_PREVIEW_SIGNING_KEY`.
   *
   * Present for tests and for hosts that read the environment themselves. Never
   * wire it to a value coming from a configuration file: rule R7 keeps secrets
   * out of files and out of any model context.
   */
  readonly signingKey?: string
  /** Injectable clock, so expiry is testable without waiting. */
  readonly now?: () => number
  readonly maxLifetimeSeconds?: number
}

export interface PreviewTokenRequest {
  readonly collection: string
  readonly entryId: string
  /** Lifetime in seconds, counted from now. */
  readonly expiresIn: number
}

export interface IssuedPreviewToken {
  readonly token: string
  readonly grant: PreviewGrant
}

export interface PreviewTokenService {
  issue(request: PreviewTokenRequest): IssuedPreviewToken
  /** Throws `PREVIEW_TOKEN_INVALID` or `PREVIEW_TOKEN_EXPIRED`; never returns a bad grant. */
  verify(token: string): PreviewGrant
}

interface TokenPayload {
  readonly v: string
  readonly collection: string
  readonly entryId: string
  readonly expiresAt: number
}

function invalid(reason: string): CogentaError {
  // The reason names the shape of the failure, never the expected signature or
  // any part of the key: an error message is an oracle if it says too much.
  return new CogentaError({
    code: 'PREVIEW_TOKEN_INVALID',
    message: `This preview link is not valid (${reason}).`,
    hint: 'Ask the editor for a fresh preview link.',
  })
}

export function createPreviewTokens(options: PreviewTokenOptions = {}): PreviewTokenService {
  const signingKey = options.signingKey ?? process.env[PREVIEW_SIGNING_KEY_ENV]
  const now = options.now ?? Date.now
  const maxLifetime = options.maxLifetimeSeconds ?? MAX_PREVIEW_LIFETIME_SECONDS

  if (signingKey === undefined || signingKey.length < PREVIEW_SIGNING_KEY_MINIMUM_LENGTH) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `Preview tokens need ${PREVIEW_SIGNING_KEY_ENV} to hold at least ${PREVIEW_SIGNING_KEY_MINIMUM_LENGTH} characters.`,
      hint: `Set ${PREVIEW_SIGNING_KEY_ENV} in the environment — for example \`openssl rand -hex 32\`. Never put it in a configuration file.`,
    })
  }

  const sign = (encodedPayload: string): string =>
    createHmac('sha256', signingKey).update(`${TOKEN_VERSION}.${encodedPayload}`).digest('hex')

  return {
    issue: ({ collection, entryId, expiresIn }): IssuedPreviewToken => {
      if (collection === '' || entryId === '') {
        throw invalid('a token must name a collection and an entry')
      }
      if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > maxLifetime) {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: `A preview token lasts between 1 and ${maxLifetime} seconds, received ${String(expiresIn)}.`,
          hint: 'Pass the lifetime in seconds, for example 3600 for one hour.',
        })
      }

      const expiresAt = now() + Math.floor(expiresIn) * 1000
      const payload: TokenPayload = { v: TOKEN_VERSION, collection, entryId, expiresAt }
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')

      return {
        token: `${encoded}.${sign(encoded)}`,
        grant: { collection, entryId, expiresAt },
      }
    },

    verify: (token): PreviewGrant => {
      const separator = token.lastIndexOf('.')
      if (separator <= 0 || separator === token.length - 1) throw invalid('malformed')

      const encoded = token.slice(0, separator)
      const received = Buffer.from(token.slice(separator + 1), 'utf8')
      const expected = Buffer.from(sign(encoded), 'utf8')

      // The signature is checked before the payload is even parsed: nothing in
      // an unsigned token is data, it is an assertion by a stranger. The length
      // guard comes first because `timingSafeEqual` throws on a mismatch — a
      // truncated token is rejected without ever comparing bytes.
      if (received.length !== expected.length) throw invalid('bad signature')
      if (!timingSafeEqual(expected, received)) throw invalid('bad signature')

      const payload = decode(encoded)
      if (payload.v !== TOKEN_VERSION) throw invalid('unsupported version')

      if (payload.expiresAt <= now()) {
        throw new CogentaError({
          code: 'PREVIEW_TOKEN_EXPIRED',
          message: 'This preview link has expired.',
          hint: 'Ask the editor for a fresh preview link.',
          details: { collection: payload.collection },
        })
      }

      return {
        collection: payload.collection,
        entryId: payload.entryId,
        expiresAt: payload.expiresAt,
      }
    },
  }
}

function decode(encoded: string): TokenPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch (error) {
    // Reachable only with a valid signature over an invalid payload, which
    // means the key leaked or a token was built by hand. Still not a crash.
    throw new CogentaError({
      code: 'PREVIEW_TOKEN_INVALID',
      message: 'This preview link is not valid (unreadable payload).',
      hint: 'Ask the editor for a fresh preview link.',
      cause: error,
    })
  }

  if (parsed === null || typeof parsed !== 'object') throw invalid('unreadable payload')
  const { v, collection, entryId, expiresAt } = parsed as Record<string, unknown>

  if (typeof collection !== 'string' || collection === '') throw invalid('no collection')
  if (typeof entryId !== 'string' || entryId === '') throw invalid('no entry')
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) throw invalid('no expiry')

  return { v: typeof v === 'string' ? v : '', collection, entryId, expiresAt }
}
