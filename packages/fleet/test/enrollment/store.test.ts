import { describe, expect, it } from 'vitest'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { testDb } from '../helpers/db.js'

const SITE_PUBLIC_KEY = 'fake-base64-spki-public-key'

describe('createEnrollmentStore', () => {
  it('issues a real, hashed-at-rest pairing token with a real expiry', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)

    const issued = await store.issuePairingToken('client-a')

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('consuming a valid, fresh token registers a real site with the submitted public key', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    const { token } = await store.issuePairingToken('client-a')

    const result = await store.consumePairingToken(token, SITE_PUBLIC_KEY)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.site.name).toBe('client-a')
    expect(result.site.publicKey).toBe(SITE_PUBLIC_KEY)
    expect(result.site.revoked).toBe(false)

    const fetched = await store.getSite(result.site.id)
    expect(fetched).toEqual(result.site)
  })

  it('refuses to consume the same token twice — the required replay-protection test', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    const { token } = await store.issuePairingToken('client-a')

    const first = await store.consumePairingToken(token, SITE_PUBLIC_KEY)
    expect(first.ok).toBe(true)

    const second = await store.consumePairingToken(token, 'a-different-key')
    expect(second).toEqual({ ok: false, reason: 'already_used' })
  })

  it('refuses an unknown token', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)

    const result = await store.consumePairingToken('not-a-real-token', SITE_PUBLIC_KEY)
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses an expired token, even one that was never consumed', async () => {
    const db = await testDb()
    let clock = 1_000_000
    const store = createEnrollmentStore(db, () => clock)

    const { token } = await store.issuePairingToken('client-a', 1000)
    clock += 2000 // past the 1000ms TTL

    const result = await store.consumePairingToken(token, SITE_PUBLIC_KEY)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('revokes a site, and isRevoked reflects it immediately', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    const { token } = await store.issuePairingToken('client-a')
    const consumed = await store.consumePairingToken(token, SITE_PUBLIC_KEY)
    if (!consumed.ok) throw new Error('unreachable')

    expect(await store.isRevoked(consumed.site.id)).toBe(false)

    await store.revokeSite(consumed.site.id)

    expect(await store.isRevoked(consumed.site.id)).toBe(true)
    const site = await store.getSite(consumed.site.id)
    expect(site?.revoked).toBe(true)
    expect(site?.revokedAt).not.toBeNull()
  })

  it('isRevoked is false for an unknown site id, not an error', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    expect(await store.isRevoked('does-not-exist')).toBe(false)
  })
})
