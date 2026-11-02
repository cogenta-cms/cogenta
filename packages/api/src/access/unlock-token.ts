import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The proof that a visitor answered a page's password (`schema@2.3`,
 * ADR-0037).
 *
 * Deliberately the same shape as `preview-token.ts`, and for the same
 * reasons: signed rather than encrypted, because it carries no secret — only
 * the assertion "whoever holds this answered the password of entry X, until
 * this instant" — HMAC-SHA256, constant-time comparison, a version in the
 * payload so a format change cannot be replayed as the old one.
 *
 * What it is *not*: a session. It says nothing about who the visitor is, it
 * grants exactly one entry, and it expires. Two people sharing a password
 * share a page, which is what a page password means.
 *
 * The key is the site's own auth signing key rather than a second secret to
 * set up: every real site already has one (`create-cogenta` writes it, and
 * nothing starts without it), and inventing a second variable for this would
 * be one more thing to get wrong for no extra safety — the two uses are
 * separated by the payload's own version prefix, not by the key.
 */

const TOKEN_VERSION = 'unlock.v2'

/** A day. Long enough that reading a protected page is not a chore, short enough that a shared computer forgets. */
export const DEFAULT_UNLOCK_LIFETIME_SECONDS = 24 * 60 * 60
/** A week: past this, "protected" would mean "protected once, years ago". */
export const MAX_UNLOCK_LIFETIME_SECONDS = 7 * 24 * 60 * 60

export interface UnlockTokenOptions {
  readonly signingKey: string
  /** Injectable clock, so expiry is testable without waiting. */
  readonly now?: () => number
  readonly lifetimeSeconds?: number
}

export interface UnlockTokenService {
  /**
   * `lockStamp` is `stampOf` the stored password hash of the entry at
   * the moment it was answered: changing the password changes the version, so
   * a proof earned with the old one stops opening the page.
   */
  issue(entryId: string, lockStamp: string): string
  /**
   * A short, stable marker of one stored password hash. It is keyed with the
   * signing key and truncated, so the cookie that carries it reveals nothing
   * about the hash it stands for.
   */
  stampOf(lockDigest: string): string
  /** `false` for anything that is not a valid, unexpired token for this entry and password. Never throws. */
  accepts(entryId: string, token: string | undefined, lockStamp: string): boolean
  /**
   * What a signed, unexpired token claims — the entry it was issued for and
   * the password version it was issued under — so a caller can look up the
   * current version of *that* entry and then ask `accepts`. `null` for
   * anything else. The claim is not a grant: only `accepts` is.
   */
  claims(token: string | undefined): { readonly entryId: string; readonly lockStamp: string } | null
  /**
   * The cookie this entry's proof travels in.
   *
   * One cookie per entry, named after a digest of the id rather than the id
   * itself: a cookie name is visible to any script on the origin, and the
   * list of entry ids a visitor has unlocked is not something a page needs to
   * be able to enumerate.
   */
  cookieName(entryId: string): string
}

interface UnlockPayload {
  readonly v: string
  readonly entryId: string
  readonly ls: string
  readonly expiresAt: number
}

export function createUnlockTokens(options: UnlockTokenOptions): UnlockTokenService {
  const now = options.now ?? Date.now
  const lifetime = Math.min(
    Math.max(options.lifetimeSeconds ?? DEFAULT_UNLOCK_LIFETIME_SECONDS, 60),
    MAX_UNLOCK_LIFETIME_SECONDS,
  )

  const sign = (encoded: string): string =>
    createHmac('sha256', options.signingKey).update(`${TOKEN_VERSION}.${encoded}`).digest('hex')

  const stampOf = (lockDigest: string): string =>
    createHmac('sha256', options.signingKey)
      .update(`${TOKEN_VERSION}.lock.${lockDigest}`)
      .digest('hex')
      .slice(0, 16)

  /** The payload of a token that is signed and not expired, or `null`. */
  const verified = (token: string | undefined): UnlockPayload | null => {
    if (token === undefined || token === '') return null
    const separator = token.lastIndexOf('.')
    if (separator <= 0 || separator === token.length - 1) return null

    const encoded = token.slice(0, separator)
    const received = Buffer.from(token.slice(separator + 1), 'utf8')
    const expected = Buffer.from(sign(encoded), 'utf8')
    // Signature first, always: nothing inside an unsigned token is data, it
    // is a claim by a stranger. The length guard comes first because
    // `timingSafeEqual` throws on a mismatch.
    if (received.length !== expected.length) return null
    if (!timingSafeEqual(expected, received)) return null

    let payload: UnlockPayload
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as UnlockPayload
    } catch {
      return null
    }
    if (payload.v !== TOKEN_VERSION) return null
    if (typeof payload.entryId !== 'string' || typeof payload.ls !== 'string') return null
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= now()) return null
    return payload
  }

  return {
    cookieName: (entryId) =>
      `cg_unlock_${createHash('sha256').update(entryId).digest('hex').slice(0, 16)}`,

    stampOf,

    issue: (entryId, lockStamp) => {
      const payload: UnlockPayload = {
        v: TOKEN_VERSION,
        entryId,
        ls: lockStamp,
        expiresAt: now() + lifetime * 1000,
      }
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
      return `${encoded}.${sign(encoded)}`
    },

    claims: (token) => {
      const payload = verified(token)
      return payload === null ? null : { entryId: payload.entryId, lockStamp: payload.ls }
    },

    accepts: (entryId, token, lockStamp) => {
      const payload = verified(token)
      return payload !== null && payload.entryId === entryId && payload.ls === lockStamp
    },
  }
}
