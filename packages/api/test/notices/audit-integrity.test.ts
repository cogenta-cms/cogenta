import {
  type AuditIntegrityStore,
  createAuditIntegrityStore,
  createAuditLog,
  ensureAuthTables,
} from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AUDIT_INTEGRITY_BROKEN_ID,
  createAuditIntegritySource,
} from '../../src/notices/audit-integrity.js'
import { ANONYMOUS } from '../../src/types.js'

/** A real audit log and a real scheduled check throughout — this notice reads their real state, nothing mocked. */
let db: DatabaseHandle

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
})

afterEach(async () => {
  await db.close()
})

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }

describe('the audit integrity notice', () => {
  it('says nothing before any check has run', async () => {
    const integrity = createAuditIntegrityStore(db, createAuditLog(db))
    const source = createAuditIntegritySource({ integrity })

    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('says nothing while the chain checks out', async () => {
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })
    await integrity.check()

    expect(await source(integrity).list({ actor: ADMIN })).toEqual([])
  })

  it('warns an admin, undismissably, once a scheduled check finds the chain broken', async () => {
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)
    const entry = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })
    await integrity.check()
    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${entry.id}`)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    await integrity.check()

    const [notice] = await source(integrity).list({ actor: ADMIN })
    expect(notice).toMatchObject({
      id: AUDIT_INTEGRITY_BROKEN_ID,
      severity: 'danger',
      dismissible: false,
    })
  })

  it('tells nothing to an editor or to a stranger, even about a broken chain', async () => {
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)
    const entry = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })
    await integrity.check()
    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${entry.id}`)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    await integrity.check()

    expect(await source(integrity).list({ actor: EDITOR })).toEqual([])
    expect(await source(integrity).list({ actor: ANONYMOUS })).toEqual([])
  })

  it('points at somewhere an admin can look further', async () => {
    const audit = createAuditLog(db)
    const integrity = createAuditIntegrityStore(db, audit)
    const entry = await audit.record({ actorId: 'user-1', actorRoles: [], action: 'login' })
    await integrity.check()
    await db.query(sql`update cogenta_audit_log set action = ${'tampered'} where id = ${entry.id}`)
    await audit.record({ actorId: 'user-1', actorRoles: [], action: 'second' })
    await integrity.check()

    const [notice] = await source(integrity, '/audit-log').list({ actor: ADMIN })
    expect(notice?.action?.href).toBe('/audit-log')
  })
})

function source(integrity: AuditIntegrityStore, auditHref?: string) {
  return createAuditIntegritySource({
    integrity,
    ...(auditHref === undefined ? {} : { auditHref }),
  })
}
