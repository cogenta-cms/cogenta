import { type AuditLog, createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createRecoveryCodeUsedNoticeSource,
  RECOVERY_CODE_USED_ID,
} from '../../src/notices/recovery-code-used.js'
import { ANONYMOUS } from '../../src/types.js'

let db: DatabaseHandle
let audit: AuditLog

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
  audit = createAuditLog(db)
})

afterEach(async () => {
  await db.close()
})

const ALICE = { id: 'user-alice', roles: ['editor'] }
const BOB = { id: 'user-bob', roles: ['editor'] }

describe('the recovery-code-used notice', () => {
  it('says nothing for an account that never used a recovery code', async () => {
    const source = createRecoveryCodeUsedNoticeSource({ audit })
    expect(await source.list({ actor: ALICE })).toEqual([])
  })

  it('warns the account that just used one', async () => {
    await audit.record({ actorId: ALICE.id, actorRoles: ALICE.roles, action: 'auth.login' })
    await audit.record({
      actorId: ALICE.id,
      actorRoles: ALICE.roles,
      action: 'auth.recovery_code_used',
    })

    const [notice] = await createRecoveryCodeUsedNoticeSource({ audit }).list({ actor: ALICE })
    expect(notice).toMatchObject({
      id: RECOVERY_CODE_USED_ID,
      severity: 'warning',
      dismissible: true,
    })
  })

  it("never shows one account's event to another", async () => {
    await audit.record({
      actorId: ALICE.id,
      actorRoles: ALICE.roles,
      action: 'auth.recovery_code_used',
    })

    const source = createRecoveryCodeUsedNoticeSource({ audit })
    expect(await source.list({ actor: BOB })).toEqual([])
  })

  it('tells nothing to an anonymous caller', async () => {
    const source = createRecoveryCodeUsedNoticeSource({ audit })
    expect(await source.list({ actor: ANONYMOUS })).toEqual([])
  })

  it('stops appearing once the event falls outside the window', async () => {
    // A clock of its own: the entry's `at` has to be driven by the same fake
    // time as the notice source, or "later" is meaningless relative to it.
    let clock = 1_700_000_000_000
    const clockedAudit = createAuditLog(db, () => clock)
    await clockedAudit.record({
      actorId: ALICE.id,
      actorRoles: ALICE.roles,
      action: 'auth.recovery_code_used',
    })

    const windowMs = 30 * 24 * 60 * 60 * 1000
    const source = createRecoveryCodeUsedNoticeSource({
      audit: clockedAudit,
      windowMs,
      now: () => clock,
    })
    expect(await source.list({ actor: ALICE })).toHaveLength(1)

    clock += windowMs + 1_000
    const later = createRecoveryCodeUsedNoticeSource({
      audit: clockedAudit,
      windowMs,
      now: () => clock,
    })
    expect(await later.list({ actor: ALICE })).toEqual([])
  })

  it('points at the profile screen by default, and a custom href when given one', async () => {
    await audit.record({
      actorId: ALICE.id,
      actorRoles: ALICE.roles,
      action: 'auth.recovery_code_used',
    })

    const defaultHref = await createRecoveryCodeUsedNoticeSource({ audit }).list({ actor: ALICE })
    expect(defaultHref[0]?.action?.href).toBe('/profile')

    const custom = await createRecoveryCodeUsedNoticeSource({
      audit,
      profileHref: '/account/security',
    }).list({ actor: ALICE })
    expect(custom[0]?.action?.href).toBe('/account/security')
  })
})
