import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createAuditLog } from '../src/audit.js'
import { testDb } from './helpers/db.js'

describe('AuditLog', () => {
  it('records an entry with no previous hash for the first append', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)

    const entry = await audit.record({ actorId: 'user-1', actorRoles: ['admin'], action: 'login' })
    expect(entry.previousHash).toBeNull()
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('chains each entry to the previous one', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)

    const first = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })
    const second = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'logout' })

    expect(second.previousHash).toBe(first.hash)
  })

  it('serialises concurrent appends into one consistent chain', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)

    const entries = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        audit.record({ actorId: 'user-1', actorRoles: [], action: `action-${i}` }),
      ),
    )

    const hashes = new Set(entries.map((e) => e.hash))
    expect(hashes.size).toBe(10) // no two entries collided onto the same previousHash

    await expect(audit.verify()).resolves.toBeUndefined()
  })

  it('lists entries most recent first', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    clock += 1_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })

    const list = await audit.list()
    expect(list.map((e) => e.action)).toEqual(['second', 'first'])
  })

  it('filters by actor, action and collection', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)

    await audit.record({
      actorId: 'user-1',
      actorRoles: [],
      action: 'update',
      collection: 'article',
    })
    await audit.record({
      actorId: 'user-2',
      actorRoles: [],
      action: 'update',
      collection: 'article',
    })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'delete', collection: 'page' })

    expect((await audit.list({ actorId: 'user-1' })).length).toBe(2)
    expect((await audit.list({ action: 'update' })).length).toBe(2)
    expect((await audit.list({ collection: 'page' })).length).toBe(1)
  })

  it('verify() passes on an untouched chain', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'logout' })

    await expect(audit.verify()).resolves.toBeUndefined()
  })

  it('verify() detects a row edited outside of record()', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const entry = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })

    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${entry.id}`)

    await expect(audit.verify()).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
  })

  it('verify() detects a row deleted from the middle of the chain', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const second = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })

    await db.query(sql`delete from cogenta_audit_log where id = ${second.id}`)

    await expect(audit.verify()).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
  })

  it('records a null actor for system-originated entries', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const entry = await audit.record({ actorId: null, actorRoles: [], action: 'system.migrate' })
    expect(entry.actorId).toBeNull()
  })

  it('carries a diff through unchanged', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const diff = { title: { before: 'Old', after: 'New' } }
    const entry = await audit.record({
      actorId: 'user-1',
      actorRoles: [],
      action: 'update',
      diff,
    })
    expect(entry.diff).toEqual(diff)
  })
})
