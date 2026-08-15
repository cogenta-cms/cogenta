import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { createPasswordResetStore, type PasswordResetStore } from '../src/resets.js'
import { createSessionStore } from '../src/sessions.js'
import { ensureAuthTables, TABLES } from '../src/tables.js'
import { createUserStore } from '../src/users.js'

export interface ResetHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The single contract suite for password reset, written once and run against
 * SQLite as a unit test and against Postgres, MySQL and MariaDB as integration
 * tests. The single-use guarantee rests on `update ... where used_at is null`
 * reporting `rowsAffected` honestly, and that is exactly the kind of claim
 * that is true on one dialect and quietly false on another.
 */
export function runPasswordResetContract(name: string, create: () => Promise<ResetHarness>): void {
  describe(`PasswordResetStore contract — ${name}`, () => {
    let harness: ResetHarness
    let db: DatabaseHandle
    let resets: PasswordResetStore
    let clock = Date.parse('2026-08-15T10:00:00.000Z')

    const now = (): number => clock

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      clock = Date.parse('2026-08-15T10:00:00.000Z')
      await ensureAuthTables(db)
      // Every dialect keeps its tables between tests; only this package's rows
      // are cleared, and only the ones these tests write.
      for (const table of [
        TABLES.passwordResets,
        TABLES.sessions,
        TABLES.credentials,
        TABLES.users,
      ]) {
        await db.query(sql`delete from ${identifier(table, db.dialect)}`)
      }
      resets = createPasswordResetStore(db, now)
    })

    afterEach(async () => {
      await db.close()
      await harness.dispose?.()
    })

    const someone = async (email = 'forgetful@example.com'): Promise<string> => {
      const users = createUserStore(db, now)
      const user = await users.create({ email, roles: ['editor'] })
      return user.id
    }

    it('issues a token that redeems once, for the user it was issued to', async () => {
      const userId = await someone()
      const issued = await resets.issue(userId)

      expect(issued.token).toBeTruthy()
      expect(await resets.redeem(issued.token)).toEqual({
        kind: 'ready',
        userId,
        resetId: issued.id,
      })
    })

    /**
     * Found by a real failing run, not by imagination: base64url contains
     * `-`, so about one token in sixty-four began with one, and
     * `--token -Xy...` was then read as an unknown option instead of as a
     * value. A token has to survive being pasted into a shell.
     */
    it('mints a token no shell or argument parser can mistake for an option', async () => {
      const userId = await someone()
      for (let attempt = 0; attempt < 200; attempt++) {
        const issued = await resets.issue(userId)
        expect(issued.token).toMatch(/^[0-9a-f]+$/)
      }
    })

    it('refuses the same token a second time', async () => {
      const userId = await someone()
      const issued = await resets.issue(userId)

      await resets.redeem(issued.token)
      expect(await resets.redeem(issued.token)).toEqual({ kind: 'used' })
    })

    it('hands out `ready` to exactly one of two simultaneous redemptions', async () => {
      const userId = await someone()
      const issued = await resets.issue(userId)

      const [first, second] = await Promise.all([
        resets.redeem(issued.token),
        resets.redeem(issued.token),
      ])

      const ready = [first, second].filter((outcome) => outcome.kind === 'ready')
      expect(ready).toHaveLength(1)
    })

    it('refuses a token once its short life is over', async () => {
      const userId = await someone()
      const issued = await resets.issue(userId, { ttlMs: 60_000 })

      clock += 60_001
      expect(await resets.redeem(issued.token)).toEqual({ kind: 'expired' })
    })

    it('refuses a token nobody ever issued', async () => {
      expect(await resets.redeem('not-a-real-token')).toEqual({ kind: 'invalid' })
    })

    it('kills the previous link when a second reset is asked for', async () => {
      const userId = await someone()
      const first = await resets.issue(userId)
      const second = await resets.issue(userId)

      expect(await resets.redeem(first.token)).toEqual({ kind: 'invalid' })
      expect((await resets.redeem(second.token)).kind).toBe('ready')
    })

    it("never lets one person's token name another person", async () => {
      const victim = await someone('victim@example.com')
      const attacker = await someone('attacker@example.com')
      const issued = await resets.issue(attacker)

      const outcome = await resets.redeem(issued.token)
      // The token carries its own owner: there is no parameter to point it at
      // someone else, which is the whole reason the user id is not in the link.
      expect(outcome).toMatchObject({ kind: 'ready', userId: attacker })
      expect(outcome).not.toMatchObject({ userId: victim })
    })

    it('stores the token only as a hash, so the table hands out nothing live', async () => {
      const userId = await someone()
      const issued = await resets.issue(userId)

      const rows = await db.query<{ token_hash: string }>(
        sql`select token_hash from ${identifier(TABLES.passwordResets, db.dialect)}`,
      )
      expect(rows.rows[0]?.token_hash).not.toBe(issued.token)
      expect(rows.rows).toHaveLength(1)
    })

    it('leaves nothing usable behind once every reset for a user is revoked', async () => {
      const userId = await someone()
      const issued = await resets.issue(userId)

      await resets.revokeAllFor(userId)
      expect(await resets.redeem(issued.token)).toEqual({ kind: 'invalid' })
    })

    /**
     * The composition the CLI performs, proven here rather than only there:
     * a reset that does not end the sessions opened with the old password
     * leaves whoever knew it signed in.
     */
    it('lets a redeemed reset replace the password and end the old sessions', async () => {
      const userId = await someone()
      const credentials = createCredentialStore(db, now)
      const sessions = createSessionStore(db, now)
      await credentials.setPassword(userId, 'the old one')
      const stolen = await sessions.create(userId)
      expect(await sessions.resolve(stolen.token)).not.toBeNull()

      const issued = await resets.issue(userId)
      const outcome = await resets.redeem(issued.token)
      expect(outcome.kind).toBe('ready')

      await credentials.setPassword(userId, 'the new one')
      await sessions.revokeAll(userId)

      expect(await credentials.verifyPassword(userId, 'the old one')).toBe(false)
      expect(await credentials.verifyPassword(userId, 'the new one')).toBe(true)
      expect(await sessions.resolve(stolen.token)).toBeNull()
    })
  })
}
