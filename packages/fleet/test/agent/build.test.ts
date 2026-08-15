import { buildSbom } from '@cogenta/agents-builtin'
import { createCredentialStore, createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { fingerprintSbom, summarizeAdminAccounts } from '../../src/agent/build.js'

describe('fingerprintSbom', () => {
  it('is deterministic regardless of dependency insertion order', () => {
    const a = buildSbom({ react: '19.0.0', zod: '4.0.0' })
    const b = buildSbom({ zod: '4.0.0', react: '19.0.0' })
    expect(fingerprintSbom(a)).toBe(fingerprintSbom(b))
  })

  it('changes when a real dependency version changes', () => {
    const before = fingerprintSbom(buildSbom({ react: '19.0.0' }))
    const after = fingerprintSbom(buildSbom({ react: '19.1.0' }))
    expect(before).not.toBe(after)
  })
})

describe('summarizeAdminAccounts', () => {
  it('counts real admin users and real MFA enrollment, never identities', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db)
    const users = createUserStore(db)
    const credentials = createCredentialStore(db)

    const admin1 = await users.create({ email: 'a@example.com', roles: ['admin'] })
    const admin2 = await users.create({ email: 'b@example.com', roles: ['admin'] })
    await users.create({ email: 'editor@example.com', roles: ['editor'] })

    await credentials.setTotpSecret(admin1.id, 'JBSWY3DPEHPK3PXP')
    await credentials.confirmTotp(admin1.id)
    await credentials.setPassword(admin2.id, 'a real password, not a totp/webauthn factor')

    const summary = await summarizeAdminAccounts(users, credentials)

    expect(summary.count).toBe(2)
    expect(summary.mfaEnabledCount).toBe(1)
    expect(JSON.stringify(summary)).not.toContain('example.com')
  })
})
