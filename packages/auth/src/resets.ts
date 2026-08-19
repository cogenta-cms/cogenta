import { createHash, randomBytes } from 'node:crypto'
import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'

/**
 * Password reset: a single-use, short-lived token bound to one user.
 *
 * Until now a person who forgot their password had no way back in — the only
 * account command was `users create`, so the recovery procedure was "ask an
 * administrator to make you a second account". This is the missing half.
 *
 * The token is opaque random bytes stored only as a hash, for the same reason
 * a session token is (`sessions.ts`): a leaked table must hand out nothing
 * live. It is deliberately **not** a signed/HMAC'd payload. A signature would
 * let a link be validated without touching the database, and that is exactly
 * what must not happen here — single use and revocation are properties of a
 * row, not of a signature, and a signed token that has already been used is
 * still a valid signature. The database round trip is the feature.
 */

const TOKEN_BYTES = 32

/**
 * Hex, not base64url — and that is not a stylistic preference.
 *
 * base64url's alphabet contains `-`. Roughly one token in sixty-four therefore
 * *starts* with a dash, and `cogenta users reset-password --token -Xy...` is
 * then parsed as an unknown option rather than as a value: the command refuses
 * a perfectly valid token with a usage error, for one person in sixty-four.
 * That is exactly the kind of defect that never shows up in a test written
 * once and passes for months. Hex costs 32 characters of length and has no
 * character that any shell, URL or argument parser treats as special.
 */
function encodeToken(bytes: Buffer): string {
  return bytes.toString('hex')
}

/**
 * 30 minutes. Long enough to walk to the inbox and back, short enough that a
 * reset link sitting in a mailbox archive is worthless within the hour — a
 * reset token is a full account takeover if it leaks, so it gets a far
 * shorter life than the 30-day session it can be exchanged for.
 */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

export interface IssuedPasswordReset {
  readonly id: string
  readonly userId: string
  /** Shown once, to be put in the link. Never stored, never recoverable. */
  readonly token: string
  readonly expiresAt: string
}

/**
 * What redeeming a token found. Separate cases rather than a boolean, so the
 * caller can say *why* a link did not work — "this link has already been
 * used" and "this link has expired" send a person to different next steps.
 */
export type PasswordResetOutcome =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'used' }
  | { readonly kind: 'ready'; readonly userId: string; readonly resetId: string }

/**
 * What `pending` reports for a still-usable token — fiche 17 task 1's "état «
 * invitation envoyée le … »", read off the very row `issue` already wrote
 * rather than a second, parallel piece of state to keep in sync with it.
 */
export interface PendingReset {
  readonly issuedAt: string
  readonly expiresAt: string
}

export interface PasswordResetStore {
  /**
   * Issues a token for a user, invalidating any still outstanding for them.
   *
   * Only one live reset per person: asking again because the first mail never
   * arrived must not leave two working links behind, and the newest request
   * is always the one the person is actually looking at. This is also how a
   * resend works for an invitation (fiche 17 task 1): calling `issue` again
   * both replaces the link and answers "which token is live" with no
   * ambiguity.
   */
  issue(userId: string, options?: { readonly ttlMs?: number }): Promise<IssuedPasswordReset>
  /**
   * Consumes a token. Redeeming is the single-use point: a `ready` outcome is
   * returned at most once for a given token, ever, even if two processes ask
   * at the same instant.
   */
  redeem(token: string): Promise<PasswordResetOutcome>
  /** Invalidates every outstanding reset for a user, used or not. */
  revokeAllFor(userId: string): Promise<void>
  /** The still-usable token for this user, if any — never the token itself, which is only ever shown once, at `issue`. */
  pending(userId: string): Promise<PendingReset | null>
}

interface ResetRow {
  id: string
  user_id: string
  created_at: string
  expires_at: string
  used_at: string | null
}

function issueToken(): string {
  return encodeToken(randomBytes(TOKEN_BYTES))
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function createPasswordResetStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): PasswordResetStore {
  const table = identifier(TABLES.passwordResets, db.dialect)

  async function markUsed(id: string, at: string): Promise<boolean> {
    // The `used_at is null` guard is what makes single use real rather than
    // hoped for: two concurrent redemptions both read a usable row, but only
    // one UPDATE matches, and the other sees zero rows affected.
    const result = await db.query(
      sql`update ${table} set used_at = ${at} where id = ${id} and used_at is null`,
    )
    return result.rowsAffected > 0
  }

  return {
    issue: async (userId, options) => {
      await db.query(sql`delete from ${table} where user_id = ${userId} and used_at is null`)

      const token = issueToken()
      const id = newId(now)
      const created = new Date(now()).toISOString()
      const expires = new Date(now() + (options?.ttlMs ?? PASSWORD_RESET_TTL_MS)).toISOString()

      await db.query(sql`
        insert into ${table} (id, user_id, token_hash, created_at, expires_at, used_at)
        values (${id}, ${userId}, ${hashToken(token)}, ${created}, ${expires}, ${null})`)

      return { id, userId, token, expiresAt: expires }
    },

    redeem: async (token) => {
      const result = await db.query<ResetRow>(
        sql`select * from ${table} where token_hash = ${hashToken(token)}`,
      )
      const row = result.rows[0]
      if (row === undefined) return { kind: 'invalid' }
      if (row.used_at !== null) return { kind: 'used' }

      const at = now()
      if (new Date(row.expires_at).getTime() <= at) return { kind: 'expired' }

      const claimed = await markUsed(row.id, new Date(at).toISOString())
      // Lost the race: another caller consumed it between the read and here.
      if (!claimed) return { kind: 'used' }

      return { kind: 'ready', userId: row.user_id, resetId: row.id }
    },

    revokeAllFor: async (userId) => {
      await db.query(sql`delete from ${table} where user_id = ${userId}`)
    },

    pending: async (userId) => {
      const result = await db.query<ResetRow>(
        sql`select * from ${table} where user_id = ${userId} and used_at is null
            order by created_at desc limit ${1}`,
      )
      const row = result.rows[0]
      if (row === undefined) return null
      if (new Date(row.expires_at).getTime() <= now()) return null
      return { issuedAt: row.created_at, expiresAt: row.expires_at }
    },
  }
}
