import { createSqliteHandle, sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../src/sessions.js'
import { ensureAuthTables } from '../src/tables.js'
import { testDb } from './helpers/db.js'

describe('SessionStore', () => {
  it('resolves a freshly issued token to its session', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)

    const issued = await sessions.create('user-1')
    const resolved = await sessions.resolve(issued.token)

    expect(resolved?.id).toBe(issued.id)
    expect(resolved?.userId).toBe('user-1')
  })

  it('never stores the bearer token itself, only its hash', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)
    const issued = await sessions.create('user-1')

    const rows = await db.query<{ token_hash: string }>(
      sql`select token_hash from cogenta_sessions`,
    )
    expect(rows.rows[0]?.token_hash).not.toBe(issued.token)
    expect(rows.rows[0]?.token_hash).not.toContain(issued.token)
  })

  it('rejects an unknown token', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)
    expect(await sessions.resolve('not-a-real-token')).toBeNull()
  })

  it('rejects an expired session', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const sessions = createSessionStore(db, () => clock)

    const issued = await sessions.create('user-1', { ttlMs: 1_000 })
    clock += 1_001
    expect(await sessions.resolve(issued.token)).toBeNull()
  })

  it('rejects a revoked session even before it expires', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)
    const issued = await sessions.create('user-1')

    await sessions.revoke(issued.id)
    expect(await sessions.resolve(issued.token)).toBeNull()
  })

  it('slides the expiry window forward on use, not just the timestamp', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const sessions = createSessionStore(db, () => clock)
    const issued = await sessions.create('user-1')

    clock += 5_000
    const first = await sessions.resolve(issued.token)
    expect(first).not.toBeNull()
    expect(new Date(first?.lastSeenAt ?? '').getTime()).toBe(clock)
  })

  it('lists only the sessions belonging to that user, oldest revoked ones excluded', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)

    const a = await sessions.create('user-1', { label: 'laptop' })
    await sessions.create('user-1', { label: 'phone' })
    await sessions.create('user-2', { label: 'other person' })
    await sessions.revoke(a.id)

    const list = await sessions.list('user-1')
    expect(list.map((s) => s.label)).toEqual(['phone'])
  })

  it('revokeAll signs a user out of every device at once', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)

    const a = await sessions.create('user-1')
    const b = await sessions.create('user-1')
    await sessions.revokeAll('user-1')

    expect(await sessions.resolve(a.token)).toBeNull()
    expect(await sessions.resolve(b.token)).toBeNull()
  })

  it('issues a different token for every session, even for the same user', async () => {
    const db = await testDb()
    const sessions = createSessionStore(db)
    const a = await sessions.create('user-1')
    const b = await sessions.create('user-1')
    expect(a.token).not.toBe(b.token)
  })

  describe('lastSeenByUser (fiche 17 task 4)', () => {
    it('reports the most recent activity across every session of a user, not just its live ones', async () => {
      let clock = 1_000_000
      const db = await testDb()
      const sessions = createSessionStore(db, () => clock)

      const older = await sessions.create('user-1')
      clock += 5_000
      await sessions.resolve(older.token) // bumps last_seen_at to 1_005_000
      await sessions.revoke(older.id)

      clock += 5_000
      const newer = await sessions.create('user-1')
      clock += 1_000
      await sessions.resolve(newer.token) // bumps last_seen_at to 1_011_000

      const lastSeen = await sessions.lastSeenByUser()
      expect(lastSeen.get('user-1')).toBe(new Date(1_011_000).toISOString())
    })

    it('keeps every account independent', async () => {
      let clock = 1_000_000
      const db = await testDb()
      const sessions = createSessionStore(db, () => clock)

      const a = await sessions.create('user-a')
      clock += 1_000
      const b = await sessions.create('user-b')

      const lastSeen = await sessions.lastSeenByUser()
      expect(lastSeen.get('user-a')).toBe(a.createdAt)
      expect(lastSeen.get('user-b')).toBe(b.createdAt)
    })

    it('says nothing about an account that never had a session', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      await sessions.create('user-1')

      const lastSeen = await sessions.lastSeenByUser()
      expect(lastSeen.has('user-2')).toBe(false)
    })
  })

  // Fiche 18 task 2: readable sessions, without ever keeping the raw header.
  describe('device metadata', () => {
    it('distils a User-Agent into a browser and device on creation, and resolve reports the same', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      const issued = await sessions.create('user-1', {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      })
      expect(issued.browser).toBe('safari')
      expect(issued.device).toBe('mobile')

      const resolved = await sessions.resolve(issued.token)
      expect(resolved?.browser).toBe('safari')
      expect(resolved?.device).toBe('mobile')
    })

    it('never stores the raw User-Agent header', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      await sessions.create('user-1', { userAgent })

      const rows = await db.query<Record<string, unknown>>(sql`select * from cogenta_sessions`)
      const row = rows.rows[0]
      expect(row).toBeDefined()
      for (const value of Object.values(row ?? {})) {
        if (typeof value === 'string') expect(value).not.toContain('Windows NT')
      }
    })

    it('reports "unknown" for a session created with no User-Agent', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      const issued = await sessions.create('user-1')
      expect(issued.browser).toBe('unknown')
      expect(issued.device).toBe('unknown')
    })

    /**
     * The migration path, not just the end state. Every other test here calls
     * `testDb()`, whose `ensureAuthTables` creates the `sessions` table and
     * immediately adds `browser`/`device` to it in the same call — real
     * `alter table` syntax, but never against a table an *older* version of
     * this package already created and populated. This test builds that
     * older shape by hand — the exact DDL `tables.ts` used before this
     * fiche, a real row already in it — then runs the current
     * `ensureAuthTables` against it, the same function `cogenta serve`
     * calls on every startup, upgrade included.
     */
    it('adds the columns to a table that already existed, without losing the row already in it', async () => {
      const db = await createSqliteHandle({ url: ':memory:' })
      await db.query(sql`
        create table cogenta_sessions (
          id text not null primary key,
          user_id text not null,
          token_hash text not null unique,
          label text,
          created_at text not null,
          expires_at text not null,
          last_seen_at text not null,
          revoked tinyint not null
        )`)
      await db.query(sql`
        insert into cogenta_sessions
          (id, user_id, token_hash, label, created_at, expires_at, last_seen_at, revoked)
        values
          ('session-pre-migration', 'user-1', 'a-real-token-hash', 'Old device',
           '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
           '2026-01-01T00:00:00.000Z', 0)`)

      // The real migration path: `create table if not exists` no-ops on a
      // table that is already there, and the `alter table add column` calls
      // that follow it now run against a table with a live row.
      await ensureAuthTables(db)

      const sessions = createSessionStore(db)
      const migrated = await sessions.list('user-1')
      expect(migrated).toHaveLength(1)
      // A row from before this fiche has no browser/device to report — the
      // column is `null`, and `fromRow` reads that as "unknown", never a
      // crash and never an empty string standing in for missing data.
      expect(migrated[0]).toMatchObject({
        id: 'session-pre-migration',
        label: 'Old device',
        browser: 'unknown',
        device: 'unknown',
      })

      // And the store this migration produced works going forward exactly
      // like a fresh install's would.
      const fresh = await sessions.create('user-1', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      })
      expect(fresh.browser).toBe('chrome')
      expect(fresh.device).toBe('desktop')
      expect(await sessions.list('user-1')).toHaveLength(2)
    })
  })

  describe('revokeAllExcept', () => {
    it('signs out every other session but leaves the named one alive', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      const kept = await sessions.create('user-1', { label: 'this device' })
      const other1 = await sessions.create('user-1', { label: 'laptop' })
      const other2 = await sessions.create('user-1', { label: 'phone' })

      const revoked = await sessions.revokeAllExcept('user-1', kept.id)
      expect(revoked).toBe(2)

      expect(await sessions.resolve(kept.token)).not.toBeNull()
      expect(await sessions.resolve(other1.token)).toBeNull()
      expect(await sessions.resolve(other2.token)).toBeNull()
    })

    it('never touches another user’s sessions', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      const mine = await sessions.create('user-1')
      const someoneElses = await sessions.create('user-2')

      await sessions.revokeAllExcept('user-1', mine.id)

      expect(await sessions.resolve(someoneElses.token)).not.toBeNull()
    })

    it('is harmless when there is nothing else to revoke', async () => {
      const db = await testDb()
      const sessions = createSessionStore(db)
      const only = await sessions.create('user-1')
      expect(await sessions.revokeAllExcept('user-1', only.id)).toBe(0)
      expect(await sessions.resolve(only.token)).not.toBeNull()
    })
  })
})
