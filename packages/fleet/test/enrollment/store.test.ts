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

    const { token } = await store.issuePairingToken('client-a', { ttlMs: 1000 })
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

  it('listSites lists every registered site, metadata only — none for an empty fleet', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    expect(await store.listSites()).toEqual([])

    const tokenA = await store.issuePairingToken('client-a')
    const a = await store.consumePairingToken(tokenA.token, SITE_PUBLIC_KEY)
    const tokenB = await store.issuePairingToken('client-b')
    const b = await store.consumePairingToken(tokenB.token, SITE_PUBLIC_KEY)
    if (!a.ok || !b.ok) throw new Error('unreachable')

    const sites = await store.listSites()
    expect(sites.map((site) => site.name).sort()).toEqual(['client-a', 'client-b'])
    expect(sites.every((site) => site.publicKey === SITE_PUBLIC_KEY)).toBe(true)
  })

  it('carries the agency client from issuance through consumption to listSites — null when never set', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)

    const labeled = await store.issuePairingToken('site-with-client', { client: 'agency-acme' })
    const labeledResult = await store.consumePairingToken(labeled.token, SITE_PUBLIC_KEY)
    const unlabeled = await store.issuePairingToken('site-without-client')
    const unlabeledResult = await store.consumePairingToken(unlabeled.token, SITE_PUBLIC_KEY)
    if (!labeledResult.ok || !unlabeledResult.ok) throw new Error('unreachable')

    expect(labeledResult.site.client).toBe('agency-acme')
    expect(unlabeledResult.site.client).toBeNull()

    const sites = await store.listSites()
    const found = sites.find((site) => site.name === 'site-with-client')
    expect(found?.client).toBe('agency-acme')
  })
})
