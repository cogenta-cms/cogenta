import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { hashPassword, verifyPassword } from './password.js'
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
  removeTotp(userId: string): Promise<void>

  addWebAuthnCredential(userId: string, data: WebAuthnCredentialData): Promise<void>
  webAuthnCredentials(userId: string): Promise<readonly WebAuthnCredentialData[]>
  webAuthnCredentialByExternalId(
    credentialId: string,
  ): Promise<{ userId: string; data: WebAuthnCredentialData } | null>
  updateWebAuthnCounter(credentialId: string, counter: number): Promise<void>

  /** What second factors, if any, this user has set up. */
  kinds(userId: string): Promise<readonly CredentialKind[]>
}

export function createCredentialStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): CredentialStore {
  const table = identifier(TABLES.credentials, db.dialect)

  async function findOne(userId: string, kind: CredentialKind): Promise<CredentialRow | undefined> {
    const result = await db.query<CredentialRow>(
      sql`select * from ${table} where user_id = ${userId} and kind = ${kind} limit ${1}`,
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
      return JSON.parse(row.data) as { secret: string; verified: boolean }
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
      await db.query(sql`delete from ${table} where user_id = ${userId} and kind = ${'totp'}`)
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
        sql`select distinct kind from ${table} where user_id = ${userId}`,
      )
      return result.rows.map((row) => row.kind as CredentialKind)
    },
  }
}
