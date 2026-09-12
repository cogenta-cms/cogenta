import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  listUpdateHistory,
  recordUpdateHistory,
  UPDATE_APPLIED_ACTION,
  UPDATE_APPLY_FAILED_ACTION,
  UPDATE_CHECKED_ACTION,
} from '../../src/update/history.js'

describe('recordUpdateHistory / listUpdateHistory', () => {
  it('records and lists every update-related audit action, most recent first', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db)
    const auditLog = createAuditLog(db)

    await recordUpdateHistory(auditLog, {
      actorId: null,
      actorRoles: ['admin'],
      action: UPDATE_CHECKED_ACTION,
      diff: {
        packages: [{ name: '@cogenta/core', installed: '0.4.0', latest: '0.4.0', bump: 'none' }],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 2))

    await recordUpdateHistory(auditLog, {
      actorId: 'user-admin',
      actorRoles: ['admin'],
      action: UPDATE_APPLIED_ACTION,
      diff: {
        installed: [{ name: '@cogenta/core', version: '0.5.0' }],
        restorePoint: '/x/update-1.zip',
      },
    })
    // Audit entries are ordered by their recorded instant, which has
    // millisecond resolution. Three writes back to back land inside the same
    // millisecond on a fast runner, and "most recent first" then has no
    // defined answer — which is how this asserted `apply_failed` and got
    // `applied`. A tick between them makes the ordering real rather than
    // lucky.
    await new Promise((resolve) => setTimeout(resolve, 2))

    await recordUpdateHistory(auditLog, {
      actorId: 'user-admin',
      actorRoles: ['admin'],
      action: UPDATE_APPLY_FAILED_ACTION,
      diff: { error: 'npm install failed' },
    })

    const history = await listUpdateHistory(auditLog)
    expect(history).toHaveLength(3)
    expect(history[0]?.action).toBe(UPDATE_APPLY_FAILED_ACTION)
    expect(history.map((entry) => entry.action).sort()).toEqual(
      [UPDATE_APPLIED_ACTION, UPDATE_APPLY_FAILED_ACTION, UPDATE_CHECKED_ACTION].sort(),
    )
  })

  it('never lists an unrelated audit entry', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db)
    const auditLog = createAuditLog(db)

    await auditLog.record({
      actorId: 'user-editor',
      actorRoles: ['editor'],
      action: 'content.update',
      diff: { title: 'x' },
    })
    await recordUpdateHistory(auditLog, {
      actorId: null,
      actorRoles: ['admin'],
      action: UPDATE_CHECKED_ACTION,
      diff: {},
    })

    const history = await listUpdateHistory(auditLog)
    expect(history).toHaveLength(1)
    expect(history[0]?.action).toBe(UPDATE_CHECKED_ACTION)
  })
})
