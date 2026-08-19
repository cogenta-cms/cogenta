import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createAuditLog } from '../src/audit.js'
import { createAuditIntegrityStore } from '../src/audit-integrity.js'
import { testDb } from './helpers/db.js'

describe('AuditIntegrityStore.status', () => {
  it('reports never-run before any check', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)

    expect(await integrity.status()).toMatchObject({ state: 'never-run', checkpoint: null })
  })
})

describe('AuditIntegrityStore.check', () => {
  it('runs a full check the first time, on an empty log', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)

    const result = await integrity.check()
    expect(result.status.state).toBe('ok')
    expect(result.status.lastMode).toBe('full')
    expect(result.status.entriesChecked).toBe(0)
    expect(result.newlyBroken).toBe(false)
  })

  it('checks incrementally after the first run, and only sees the new entries', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const first = await integrity.check()
    expect(first.status.lastMode).toBe('full')
    expect(first.status.entriesChecked).toBe(1)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })
    const second = await integrity.check()
    expect(second.status.lastMode).toBe('incremental')
    // Only the two entries recorded since the first check, not all three.
    expect(second.status.entriesChecked).toBe(2)
    expect(second.status.state).toBe('ok')
  })

  it('persists its checkpoint across a fresh store instance, surviving a restart', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)

    await createAuditIntegrityStore(db, audit).check()
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })

    // A brand-new store instance over the same database — what "the process
    // restarted" looks like from this module's point of view.
    const restarted = createAuditIntegrityStore(db, audit)
    const status = await restarted.status()
    expect(status.state).toBe('ok')

    const result = await restarted.check()
    expect(result.status.lastMode).toBe('incremental')
    expect(result.status.entriesChecked).toBe(1)
  })

  it('the alerting case: a row altered directly in the database is caught on the next check, unprompted', async () => {
    // This is the test that gives the feature its value — not that the
    // manual "verify now" button works, but that altering a row and then
    // simply calling check() again (exactly what a scheduled tick does,
    // nobody having clicked anything) reports the break.
    const db = await testDb()
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    await integrity.check()
    const second = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })

    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${second.id}`)

    const result = await integrity.check()
    expect(result.status.state).toBe('broken')
    expect(result.status.brokenEntryId).toBe(second.id)
    expect(result.newlyBroken).toBe(true)
  })

  it('stays broken on a plain re-check rather than silently recovering', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)
    const integrity = createAuditIntegrityStore(db, audit, { now: () => clock })

    const entry = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    await integrity.check()
    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${entry.id}`)

    clock += 5_000
    const broken = await integrity.check()
    expect(broken.status.state).toBe('broken')
    expect(broken.newlyBroken).toBe(true)

    clock += 5_000
    const again = await integrity.check()
    expect(again.status.state).toBe('broken')
    // Not re-announced: the alerting layer already knows about this break.
    expect(again.newlyBroken).toBe(false)
    // But it did look — the timestamp moves forward.
    expect(again.status.lastCheckedAt).not.toBe(broken.status.lastCheckedAt)
  })

  it('a forced full check can recover once the offending entry is gone', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const second = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    // First check: full (nothing checked yet), checkpoint lands on "second".
    await integrity.check()

    const third = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })
    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${third.id}`)

    // The next tick is incremental (since "second"), and "third" is exactly
    // the new material it scans — this is the same shape as the alerting
    // test above, just followed by a recovery.
    const broken = await integrity.check()
    expect(broken.status.state).toBe('broken')
    expect(broken.status.brokenEntryId).toBe(third.id)

    // The operator's real fix: remove the offending row (in real use, via
    // `prune()`, which refuses on an already-broken segment — see
    // audit.test.ts). Direct removal here isolates what this store alone is
    // responsible for: recognising that the chain is whole again.
    await db.query(sql`delete from cogenta_audit_log where id = ${third.id}`)

    const recovered = await integrity.check({ full: true })
    expect(recovered.status.state).toBe('ok')
    expect(recovered.status.checkpoint?.id).toBe(second.id)
  })

  it('runs a full check again once the interval elapses, even without forcing one', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)
    const integrity = createAuditIntegrityStore(db, audit, {
      now: () => clock,
      fullCheckIntervalMs: 1_000,
    })

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const initial = await integrity.check()
    expect(initial.status.lastMode).toBe('full')

    clock += 100
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    const stillIncremental = await integrity.check()
    expect(stillIncremental.status.lastMode).toBe('incremental')

    clock += 2_000 // past fullCheckIntervalMs since the first full check
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })
    const dueForFull = await integrity.check()
    expect(dueForFull.status.lastMode).toBe('full')
    expect(dueForFull.status.entriesChecked).toBe(3)
  })
})
