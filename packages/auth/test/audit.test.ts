import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { type AuditChainPoint, classifyAuditActor, createAuditLog } from '../src/audit.js'
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

  it('carries the content version an action produced, fiche 21 task 1', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const entry = await audit.record({
      actorId: 'user-1',
      actorRoles: [],
      action: 'content.update',
      collection: 'article',
      entryId: 'entry-1',
      version: 3,
    })
    expect(entry.version).toBe(3)
    expect((await audit.get(entry.id))?.version).toBe(3)
  })

  it('leaves version null for an action that never omitted one', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const entry = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'auth.login' })
    expect(entry.version).toBeNull()
  })

  it('does not let the version column change what verify() considers intact — it is deliberately outside the hash', async () => {
    // The chain's job is to prove *who did what to what, when*, never to
    // let a display convenience like "which version to diff" ride along
    // for free. Hashing it would mean every entry a site already has stops
    // verifying the moment this feature ships (see the long comment on
    // `computeHash` in `src/audit.ts`) — this test is what makes that
    // trade-off a checked fact rather than an assertion in a comment.
    const db = await testDb()
    const audit = createAuditLog(db)
    const entry = await audit.record({
      actorId: 'user-1',
      actorRoles: [],
      action: 'content.update',
      collection: 'article',
      entryId: 'entry-1',
      version: 2,
    })

    await db.query(sql`update cogenta_audit_log set version = ${'999'} where id = ${entry.id}`)

    await expect(audit.verify()).resolves.toBeUndefined()
    expect((await audit.get(entry.id))?.version).toBe(999)
  })
})

describe('AuditLog.get', () => {
  it('finds one entry by id', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const recorded = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })

    const found = await audit.get(recorded.id)
    expect(found?.id).toBe(recorded.id)
    expect(found?.hash).toBe(recorded.hash)
  })

  it('returns null for an id nothing recorded', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    expect(await audit.get('nonexistent')).toBeNull()
  })
})

describe('classifyAuditActor', () => {
  it('reads system from a null actor', () => {
    expect(classifyAuditActor({ actorId: null, action: 'system.migrate' })).toBe('system')
  })

  it('reads api_key from the apikey: prefix resolveActor mints', () => {
    expect(classifyAuditActor({ actorId: 'apikey:abc123', action: 'content.update' })).toBe(
      'api_key',
    )
  })

  it('reads agent from the agent.tool. prefix withAudit mints', () => {
    expect(classifyAuditActor({ actorId: 'user-1', action: 'agent.tool.content.publish' })).toBe(
      'agent',
    )
  })

  it('reads human from everything else', () => {
    expect(classifyAuditActor({ actorId: 'user-1', action: 'content.update' })).toBe('human')
  })
})

describe('AuditLog — actorKind and date-range filters (fiche 21 task 2/4)', () => {
  it('filters by actorKind', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'content.update' })
    await audit.record({ actorId: null, actorRoles: [], action: 'system.migrate' })
    await audit.record({ actorId: 'apikey:abc', actorRoles: ['editor'], action: 'content.create' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'agent.tool.content.publish' })

    expect((await audit.list({ actorKind: 'human' })).length).toBe(1)
    expect((await audit.list({ actorKind: 'system' })).length).toBe(1)
    expect((await audit.list({ actorKind: 'api_key' })).length).toBe(1)
    expect((await audit.list({ actorKind: 'agent' })).length).toBe(1)
  })

  it('filters by a date range (since/until)', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    clock += 10_000
    const middle = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })

    const found = await audit.list({ since: middle.at, until: middle.at })
    expect(found.map((entry) => entry.action)).toEqual(['second'])
  })
})

describe('AuditLog — bounded verification (verifyRange, fiche 21 task 3)', () => {
  it('is equivalent to a full verify() on an untouched chain', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const checkpoint = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })

    // The full-chain reference: verify() must not throw, and this is the
    // ground truth "incremental" is being compared against.
    await expect(audit.verify()).resolves.toBeUndefined()

    const point: AuditChainPoint = { id: checkpoint.id, at: checkpoint.at, hash: checkpoint.hash }
    const result = await audit.verifyRange(point)
    expect(result.entriesChecked).toBe(1) // only "third" is after the checkpoint
    expect(result.checkpoint).not.toBeNull()
  })

  it('detects tampering after the checkpoint, the same way a full verify() would', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const checkpoint = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    const third = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })

    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${third.id}`)

    const point: AuditChainPoint = { id: checkpoint.id, at: checkpoint.at, hash: checkpoint.hash }
    await expect(audit.verifyRange(point)).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
    await expect(audit.verify()).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
  })

  it('detects the checkpoint entry itself having been altered since it was recorded', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const checkpoint = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })

    await db.query(
      sql`update cogenta_audit_log set action = ${'tampered'} where id = ${checkpoint.id}`,
    )

    const point: AuditChainPoint = { id: checkpoint.id, at: checkpoint.at, hash: checkpoint.hash }
    await expect(audit.verifyRange(point)).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
  })

  it('reports a checkpoint that was deleted outside of prune() as broken, not as an innocent gap', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    const checkpoint = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })

    await db.query(sql`delete from cogenta_audit_log where id = ${checkpoint.id}`)

    const point: AuditChainPoint = { id: checkpoint.id, at: checkpoint.at, hash: checkpoint.hash }
    await expect(audit.verifyRange(point)).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
  })

  it('does not replay entries before the checkpoint (the bound the fiche asks for)', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    const checkpoint = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })

    // Tamper with an entry *before* the checkpoint. An incremental check
    // that starts from the checkpoint has no reason to notice — that is
    // exactly the bound that makes it practical on a huge log, and exactly
    // why the fiche asks for a full verification as a rarer backstop.
    await db.query(
      sql`update cogenta_audit_log set action = ${'tampered'} where action = ${'first'}`,
    )

    const point: AuditChainPoint = { id: checkpoint.id, at: checkpoint.at, hash: checkpoint.hash }
    await expect(audit.verifyRange(point)).resolves.toMatchObject({ entriesChecked: 0 })
    // A full verify(), the backstop, still catches it.
    await expect(audit.verify()).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
  })
})

describe('AuditLog.prune (fiche 21 task 5)', () => {
  it('deletes entries older than the cutoff and keeps the remaining chain verifiable', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)

    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    clock += 10_000
    const cutoff = new Date(clock).toISOString()
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'fourth' })

    const result = await audit.prune(cutoff)
    expect(result.prunedCount).toBe(2)
    expect(result.genesis).not.toBeNull()

    const remaining = await audit.list()
    expect(remaining.map((entry) => entry.action).sort()).toEqual(['fourth', 'third'])

    // The whole point: the segment that survives still verifies, chaining
    // from the recorded anchor instead of requiring `previousHash: null`.
    await expect(audit.verify()).resolves.toBeUndefined()
  })

  it('does nothing and reports zero when nothing is old enough', async () => {
    const db = await testDb()
    const audit = createAuditLog(db)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })

    const result = await audit.prune('1970-01-01T00:00:00.000Z')
    expect(result).toEqual({ prunedCount: 0, genesis: null })
    expect((await audit.list()).length).toBe(1)
  })

  it('refuses to prune a segment that is already tampered, rather than erasing the evidence', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)

    const first = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'first' })
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    clock += 10_000
    const cutoff = new Date(clock).toISOString()

    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${first.id}`)

    await expect(audit.prune(cutoff)).rejects.toMatchObject({ code: 'AUDIT_CHAIN_BROKEN' })
    // Nothing was deleted: refusing means refusing, not partially applying.
    expect((await audit.list()).length).toBe(2)
  })

  it('lets verifyRange resume cleanly from the genesis when a checkpoint predates a legitimate prune', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const audit = createAuditLog(db, () => clock)

    const oldCheckpoint = await audit.record({
      actorId: 'user-1',
      actorRoles: [],
      action: 'first',
    })
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    clock += 10_000
    const cutoff = new Date(clock).toISOString()
    clock += 10_000
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'third' })

    await audit.prune(cutoff)

    const point: AuditChainPoint = {
      id: oldCheckpoint.id,
      at: oldCheckpoint.at,
      hash: oldCheckpoint.hash,
    }
    const result = await audit.verifyRange(point)
    // Resumed from the genesis rather than throwing: the gap is explained.
    expect(result.entriesChecked).toBe(1) // "third" is the one surviving entry after the genesis
  })
})
