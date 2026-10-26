import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { createAuthService } from '../src/login.js'
import { createSessionStore } from '../src/sessions.js'
import { ensureAuthTables, TABLES } from '../src/tables.js'
import { createUserStore } from '../src/users.js'
import { codeFor } from './helpers/totp-code.js'

export interface TotpStorageHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'
const SECRET = 'JBSWY3DPEHPK3PXP'
const OTHER_SECRET = 'KRSXG5CTMVRXEZLU'
const T0 = Date.parse('2026-10-26T08:00:00Z')

/**
 * The storage behind the second-factor fixes of pentest 2026-10-26 (F-01,
 * F-03), written once and run against SQLite as a unit test and against
 * Postgres, MySQL and MariaDB as integration tests. Every guarantee here rests
 * on a guarded write reporting `rowsAffected` honestly, or on a transaction
 * serialising two claimants, and each of those is a claim that can be true on
 * one dialect and quietly false on another.
 */
export function runTotpStorageContract(
  name: string,
  create: () => Promise<TotpStorageHarness>,
): void {
  describe(`TOTP pending enrolment, step claim and login tickets — ${name}`, () => {
    let harness: TotpStorageHarness
    let db: DatabaseHandle
    let clock = T0
    const now = (): number => clock

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      clock = T0
      await ensureAuthTables(db)
      for (const table of [
        TABLES.loginTickets,
        TABLES.loginAttempts,
        TABLES.sessions,
        TABLES.credentials,
        TABLES.users,
      ]) {
        await db.query(sql`delete from ${identifier(table, db.dialect)}`)
      }
    })

    afterEach(async () => {
      await db.close()
      await harness.dispose?.()
    })

    const account = async (): Promise<string> => {
      const user = await createUserStore(db, now).create({
        email: 'admin@example.com',
        roles: ['admin'],
      })
      return user.id
    }

    it('creating the tables twice, and after the new column and table were dropped, converges', async () => {
      await ensureAuthTables(db)
      await db.query(sql`drop table ${identifier(TABLES.loginTickets, db.dialect)}`)
      await db.query(
        sql`alter table ${identifier(TABLES.sessions, db.dialect)} drop column ${identifier('step_up_until', db.dialect)}`,
      )

      await ensureAuthTables(db)

      const userId = await account()
      const sessions = createSessionStore(db, now)
      const session = await sessions.create(userId)
      await sessions.markSteppedUp(session.id, T0 + 1000)
      expect((await sessions.resolve(session.token))?.stepUpUntil).toBe(
        new Date(T0 + 1000).toISOString(),
      )
    })

    it('keeps a pending secret beside the active factor and never over it', async () => {
      const userId = await account()
      const credentials = createCredentialStore(db, now)
      await credentials.setTotpSecret(userId, SECRET)
      await credentials.confirmTotp(userId)

      await credentials.setPendingTotp(userId, OTHER_SECRET, T0 + 600_000)
      expect(await credentials.totpSecret(userId)).toEqual({ secret: SECRET, verified: true })
      expect(await credentials.pendingTotp(userId)).toEqual({
        secret: OTHER_SECRET,
        expiresAt: T0 + 600_000,
      })

      clock = T0 + 600_000
      expect(await credentials.pendingTotp(userId)).toBeNull()
      expect(await credentials.totpSecret(userId)).toEqual({ secret: SECRET, verified: true })
    })

    it('promotes the pending secret once, whatever the number of simultaneous claimants', async () => {
      const userId = await account()
      const credentials = createCredentialStore(db, now)
      await credentials.setTotpSecret(userId, SECRET)
      await credentials.confirmTotp(userId)
      await credentials.setPendingTotp(userId, OTHER_SECRET, T0 + 600_000)

      const results = await Promise.all(
        Array.from({ length: 5 }, () => credentials.promotePendingTotp(userId, OTHER_SECRET, 7)),
      )

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await credentials.totpSecret(userId)).toEqual({ secret: OTHER_SECRET, verified: true })
      expect(await credentials.pendingTotp(userId)).toBeNull()
    })

    it('does not promote a pending secret other than the one that was verified', async () => {
      const userId = await account()
      const credentials = createCredentialStore(db, now)
      await credentials.setPendingTotp(userId, OTHER_SECRET, T0 + 600_000)

      expect(await credentials.promotePendingTotp(userId, SECRET, 7)).toBe(false)
      expect(await credentials.totpSecret(userId)).toBeNull()
      expect(await credentials.pendingTotp(userId)).not.toBeNull()
    })

    it('accepts a time step once and refuses it, and anything older, afterwards', async () => {
      const userId = await account()
      const credentials = createCredentialStore(db, now)
      await credentials.setTotpSecret(userId, SECRET)
      await credentials.confirmTotp(userId)

      expect(await credentials.claimTotpStep(userId, 100)).toBe(true)
      expect(await credentials.claimTotpStep(userId, 100)).toBe(false)
      expect(await credentials.claimTotpStep(userId, 99)).toBe(false)
      expect(await credentials.claimTotpStep(userId, 101)).toBe(true)
    })

    it('accepts one of several simultaneous claims of the same time step', async () => {
      const userId = await account()
      const credentials = createCredentialStore(db, now)
      await credentials.setTotpSecret(userId, SECRET)
      await credentials.confirmTotp(userId)

      const results = await Promise.all(
        Array.from({ length: 5 }, () => credentials.claimTotpStep(userId, 100)),
      )

      expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('turns one sign-in ticket into one session when it is presented several times at once', async () => {
      const userId = await account()
      const credentials = createCredentialStore(db, now)
      await credentials.setPassword(userId, 'correct horse battery staple')
      await credentials.setTotpSecret(userId, SECRET)
      await credentials.confirmTotp(userId)
      const auth = createAuthService({ db, signingKey: SIGNING_KEY, collections: [], now })

      const challenge = await auth.passwordLogin(
        'admin@example.com',
        'correct horse battery staple',
      )
      if (challenge.status !== 'mfa_required') throw new Error('expected an MFA challenge')
      const code = codeFor(SECRET, T0 / 1000)

      const outcomes = await Promise.allSettled([
        auth.totpLogin(challenge.ticket, code),
        auth.totpLogin(challenge.ticket, code),
        auth.totpLogin(challenge.ticket, code),
      ])

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
      expect(await createSessionStore(db, now).list(userId)).toHaveLength(1)
    }, 30_000)
  })
}
