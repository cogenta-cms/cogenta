import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  sql,
  limit as sqlLimit,
} from '@cogenta/core'
import { hashPassword, verifyPassword } from './password.js'
import { verifyRecoveryCode } from './recovery-codes.js'
import { TABLES } from './tables.js'
import type { CredentialKind } from './types.js'

interface CredentialRow {
  id: string
  user_id: string
  kind: string
  data: string
  created_at: string
}

export interface WebAuthnCredentialData {
  readonly credentialId: string
  readonly publicKey: string
  readonly counter: number
  readonly transports: readonly string[]
  readonly label: string | undefined
}

export interface CredentialStore {
  setPassword(userId: string, password: string): Promise<void>
  verifyPassword(userId: string, password: string): Promise<boolean>
  hasPassword(userId: string): Promise<boolean>

  setTotpSecret(userId: string, secret: string): Promise<void>
  /** A secret exists but has not completed the "scan and confirm one code" step. */
  totpSecret(userId: string): Promise<{ secret: string; verified: boolean } | null>
  confirmTotp(userId: string): Promise<void>
  /** Removes the active factor *and* any pending re-enrolment: nothing TOTP-shaped is left. */
  removeTotp(userId: string): Promise<void>

  /**
   * Stores a freshly generated secret as a *pending* enrolment, valid until
   * `expiresAtMs`, **without touching the active factor** (pentest 2026-10-26,
   * F-01). One pending secret per account: asking again replaces the previous
   * pending one, never the active one.
   */
  setPendingTotp(userId: string, secret: string, expiresAtMs: number): Promise<void>
  /** The pending secret, or `null` when there is none or it has expired. */
  pendingTotp(userId: string): Promise<{ secret: string; expiresAt: number } | null>
  /** Drops the pending enrolment, if any. The active factor is left alone. */
  removePendingTotp(userId: string): Promise<void>
  /**
   * Makes the pending secret the active one — the only way a pending secret
   * becomes real. In one transaction: the pending row is claimed (a guarded
   * delete, so two concurrent confirmations cannot both win), the active row is
   * replaced by `{ secret, verified: true, lastStep: step }`. Returns `false`,
   * having changed nothing, when the pending secret is gone, expired, or is no
   * longer `expectedSecret` (a newer enrolment replaced it meanwhile).
   */
  promotePendingTotp(userId: string, expectedSecret: string, step: number): Promise<boolean>
  /**
   * Records that the TOTP time step `step` was accepted for this account's
   * active factor — and refuses a step that was already accepted, or an older
   * one (pentest 2026-10-26, F-03). Returns `true` for exactly one of any
   * number of simultaneous callers presenting the same step.
   */
  claimTotpStep(userId: string, step: number): Promise<boolean>

  addWebAuthnCredential(userId: string, data: WebAuthnCredentialData): Promise<void>
  webAuthnCredentials(userId: string): Promise<readonly WebAuthnCredentialData[]>
  webAuthnCredentialByExternalId(
    credentialId: string,
  ): Promise<{ userId: string; data: WebAuthnCredentialData } | null>
  updateWebAuthnCounter(credentialId: string, counter: number): Promise<void>

  /**
   * Replaces this account's recovery codes wholesale with `hashes` — already
   * hashed by the caller (`recovery-codes.ts`), never a plaintext code. Used
   * both for the first batch (TOTP confirmation) and for regeneration, which
   * is exactly what makes regeneration invalidate the old ones: there is
   * nothing left to consume the previous batch against.
   */
  setRecoveryCodes(userId: string, hashes: readonly string[]): Promise<void>
  /** How many codes exist and how many are still unused. `null` when none were ever issued. */
  recoveryCodesStatus(
    userId: string,
  ): Promise<{ readonly total: number; readonly remaining: number } | null>
  /**
   * Checks `code` against every unused code for this account and, on a
   * match, marks that one used. Single use is enforced with a
   * compare-and-set on the write (`resets.ts`'s `markUsed` idiom): the
   * `update` is conditioned on the row still holding the exact bytes this
   * call read, so a concurrent redemption that wrote first makes this one's
   * `update` affect zero rows, which is retried against the fresher row
   * rather than blindly overwriting it. Two simultaneous calls with the same
   * code can therefore never both return `true`. Returns `false` for no
   * account, no codes, or no match at all.
   */
  consumeRecoveryCode(userId: string, code: string): Promise<boolean>
  /** Deletes every recovery code for this account — there is nothing left to be a spare key for once TOTP itself is off. */
  removeRecoveryCodes(userId: string): Promise<void>

  /** What second factors, if any, this user has set up. */
  kinds(userId: string): Promise<readonly CredentialKind[]>
}

interface RecoveryCodeEntry {
  readonly hash: string
  readonly usedAt: string | null
}

/** Retries for `consumeRecoveryCode`'s compare-and-set — covers a genuine concurrent race, not a hostile client (see that function's own comment). */
const CONSUME_ATTEMPTS = 5

export function createCredentialStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): CredentialStore {
  const table = identifier(TABLES.credentials, db.dialect)

  async function findOne(userId: string, kind: CredentialKind): Promise<CredentialRow | undefined> {
    const result = await db.query<CredentialRow>(
      sql`select * from ${table} where user_id = ${userId} and kind = ${kind} limit ${sqlLimit(1)}`,
    )
    return result.rows[0]
  }

  async function upsert(userId: string, kind: CredentialKind, data: unknown): Promise<void> {
    const existing = await findOne(userId, kind)
    const payload = JSON.stringify(data)
    if (existing === undefined) {
      await db.query(sql`
        insert into ${table} (id, user_id, kind, data, created_at)
        values (${newId(now)}, ${userId}, ${kind}, ${payload}, ${new Date(now()).toISOString()})`)
    } else {
      await db.query(sql`update ${table} set data = ${payload} where id = ${existing.id}`)
    }
  }

  return {
    setPassword: async (userId, password) => {
      await upsert(userId, 'password', { hash: await hashPassword(password) })
    },

    verifyPassword: async (userId, password) => {
      const row = await findOne(userId, 'password')
      if (row === undefined) return false
      const { hash } = JSON.parse(row.data) as { hash: string }
      return verifyPassword(password, hash)
    },

    hasPassword: async (userId) => (await findOne(userId, 'password')) !== undefined,

    setTotpSecret: async (userId, secret) => {
      await upsert(userId, 'totp', { secret, verified: false })
    },

    totpSecret: async (userId) => {
      const row = await findOne(userId, 'totp')
      if (row === undefined) return null
      const parsed = JSON.parse(row.data) as { secret: string; verified: boolean }
      return { secret: parsed.secret, verified: parsed.verified }
    },

    confirmTotp: async (userId) => {
      const row = await findOne(userId, 'totp')
      if (row === undefined) {
        throw new CogentaError({
          code: 'AUTH_TOTP_INVALID',
          message: 'No TOTP secret was set up for this user.',
          hint: 'Call setTotpSecret before confirmTotp — there is nothing to confirm yet.',
        })
      }
      const current = JSON.parse(row.data) as { secret: string }
      await db.query(
        sql`update ${table} set data = ${JSON.stringify({ ...current, verified: true })} where id = ${row.id}`,
      )
    },

    removeTotp: async (userId) => {
      await db.query(
        sql`delete from ${table} where user_id = ${userId} and kind in (${'totp'}, ${'totp_pending'})`,
      )
    },

    setPendingTotp: async (userId, secret, expiresAtMs) => {
      await upsert(userId, 'totp_pending', { secret, expiresAt: expiresAtMs })
    },

    pendingTotp: async (userId) => {
      const row = await findOne(userId, 'totp_pending')
      if (row === undefined) return null
      const parsed = JSON.parse(row.data) as { secret: string; expiresAt: number }
      if (parsed.expiresAt <= now()) return null
      return { secret: parsed.secret, expiresAt: parsed.expiresAt }
    },

    removePendingTotp: async (userId) => {
      await db.query(
        sql`delete from ${table} where user_id = ${userId} and kind = ${'totp_pending'}`,
      )
    },

    promotePendingTotp: async (userId, expectedSecret, step) => {
      // Read outside the transaction on purpose: the claim below must be the
      // transaction's *first* statement. MariaDB 11 raises ER_CHECKREAD ("record
      // has changed since last read") when a row read earlier in the same
      // transaction is changed by a concurrent commit before it is written, so
      // a read-then-delete inside one transaction turns a lost race into an
      // error instead of a clean "zero rows".
      const row = await findOne(userId, 'totp_pending')
      if (row === undefined) return false
      const parsed = JSON.parse(row.data) as { secret: string; expiresAt: number }
      if (parsed.secret !== expectedSecret || parsed.expiresAt <= now()) return false

      return db.transaction(
        async (tx) => {
          // The claim: whoever deletes the pending row owns the swap. A second
          // confirmation racing this one finds zero rows to delete.
          const claimed = await tx.query(
            sql`delete from ${table} where id = ${row.id} and data = ${row.data}`,
          )
          if (claimed.rowsAffected === 0) return false

          const payload = JSON.stringify({ secret: expectedSecret, verified: true, lastStep: step })
          const active = await tx.query<CredentialRow>(
            sql`select * from ${table} where user_id = ${userId} and kind = ${'totp'} limit ${sqlLimit(1)}`,
          )
          const existing = active.rows[0]
          if (existing === undefined) {
            await tx.query(sql`
              insert into ${table} (id, user_id, kind, data, created_at)
              values (${newId(now)}, ${userId}, ${'totp'}, ${payload}, ${new Date(now()).toISOString()})`)
          } else {
            await tx.query(sql`update ${table} set data = ${payload} where id = ${existing.id}`)
          }
          return true
        },
        { immediate: true },
      )
    },

    claimTotpStep: async (userId, step) => {
      // Compare-and-set on the bytes just read, retried against the fresher row
      // when another caller wrote first (the `consumeRecoveryCode` shape). A
      // retry that finds the step already recorded is the replay being refused.
      for (let attempt = 0; attempt < CONSUME_ATTEMPTS; attempt += 1) {
        const row = await findOne(userId, 'totp')
        if (row === undefined) return false
        const parsed = JSON.parse(row.data) as { lastStep?: number }
        if (parsed.lastStep !== undefined && step <= parsed.lastStep) return false

        const updated = JSON.stringify({ ...parsed, lastStep: step })
        const result = await db.query(
          sql`update ${table} set data = ${updated} where id = ${row.id} and data = ${row.data}`,
        )
        if (result.rowsAffected > 0) return true
      }
      return false
    },

    addWebAuthnCredential: async (userId, data) => {
      await db.query(sql`
        insert into ${table} (id, user_id, kind, data, created_at)
        values (${newId(now)}, ${userId}, ${'webauthn'}, ${JSON.stringify(data)}, ${new Date(now()).toISOString()})`)
    },

    webAuthnCredentials: async (userId) => {
      const result = await db.query<CredentialRow>(
        sql`select * from ${table} where user_id = ${userId} and kind = ${'webauthn'}`,
      )
      return result.rows.map((row) => JSON.parse(row.data) as WebAuthnCredentialData)
    },

    webAuthnCredentialByExternalId: async (credentialId) => {
      // Every WebAuthn credential is scanned rather than indexed by its wire id:
      // one admin has a handful of passkeys, not thousands, and an index on a
      // JSON-embedded field would need a fourth table for one lookup.
      const result = await db.query<CredentialRow>(
        sql`select * from ${table} where kind = ${'webauthn'}`,
      )
      for (const row of result.rows) {
        const data = JSON.parse(row.data) as WebAuthnCredentialData
        if (data.credentialId === credentialId) return { userId: row.user_id, data }
      }
      return null
    },

    updateWebAuthnCounter: async (credentialId, counter) => {
      const result = await db.query<CredentialRow>(
        sql`select * from ${table} where kind = ${'webauthn'}`,
      )
      for (const row of result.rows) {
        const data = JSON.parse(row.data) as WebAuthnCredentialData
        if (data.credentialId === credentialId) {
          await db.query(
            sql`update ${table} set data = ${JSON.stringify({ ...data, counter })} where id = ${row.id}`,
          )
          return
        }
      }
    },

    kinds: async (userId) => {
      const result = await db.query<{ kind: string }>(
        sql`select distinct kind from ${table} where user_id = ${userId} and kind != ${'totp_pending'}`,
      )
      return result.rows.map((row) => row.kind as CredentialKind)
    },

    setRecoveryCodes: async (userId, hashes) => {
      const codes: RecoveryCodeEntry[] = hashes.map((hash) => ({ hash, usedAt: null }))
      await upsert(userId, 'recovery_codes', { codes })
    },

    recoveryCodesStatus: async (userId) => {
      const row = await findOne(userId, 'recovery_codes')
      if (row === undefined) return null
      const { codes } = JSON.parse(row.data) as { codes: readonly RecoveryCodeEntry[] }
      return {
        total: codes.length,
        remaining: codes.filter((entry) => entry.usedAt === null).length,
      }
    },

    consumeRecoveryCode: async (userId, code) => {
      // Bounded retries: a concurrent redemption can win the compare-and-set
      // below between our read and our write. When that happens we re-read
      // the row it just wrote and try again against the fresher data — the
      // same shape as `resets.ts`'s single-use guarantee, applied to a batch
      // of codes instead of one token. `CONSUME_ATTEMPTS` only has to cover
      // genuine races, not a hostile client: a wrong code never enters this
      // loop more than once, since a miss returns `false` on the first pass.
      for (let attempt = 0; attempt < CONSUME_ATTEMPTS; attempt += 1) {
        const row = await findOne(userId, 'recovery_codes')
        if (row === undefined) return false

        const parsed = JSON.parse(row.data) as { codes: readonly RecoveryCodeEntry[] }
        let matchIndex = -1
        // Each candidate is scrypt-hashed; short-circuiting on the first
        // match is the whole point — a code is a spare password, not a value
        // worth a constant-time scan over up to ten entries.
        for (const [index, entry] of parsed.codes.entries()) {
          if (entry.usedAt !== null) continue
          if (await verifyRecoveryCode(code, entry.hash)) {
            matchIndex = index
            break
          }
        }
        if (matchIndex === -1) return false

        const updated = {
          codes: parsed.codes.map((entry, index) =>
            index === matchIndex ? { ...entry, usedAt: new Date(now()).toISOString() } : entry,
          ),
        }

        // Compare-and-set against the exact bytes this call read: if another
        // caller already wrote a different version of this batch between our
        // read and this write — consuming this same code, or a different
        // one — `rowsAffected` is 0 and we loop to retry against the row
        // that actually won, rather than clobbering it.
        const result = await db.query(
          sql`update ${table} set data = ${JSON.stringify(updated)} where id = ${row.id} and data = ${row.data}`,
        )
        if (result.rowsAffected > 0) return true
      }
      return false
    },

    removeRecoveryCodes: async (userId) => {
      await db.query(
        sql`delete from ${table} where user_id = ${userId} and kind = ${'recovery_codes'}`,
      )
    },
  }
}
