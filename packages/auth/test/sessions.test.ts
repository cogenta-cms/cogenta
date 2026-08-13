import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../src/sessions.js'
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
})
