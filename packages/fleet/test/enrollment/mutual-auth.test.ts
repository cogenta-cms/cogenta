import { generateSigningKeyPair, signContent, verifyContentSignature } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { testDb } from '../helpers/db.js'

/**
 * Proves the mutual-authentication foundation "## Appairage" requires:
 * pairing records a site's REAL Ed25519 public key, and a signature the
 * site later makes with its matching private key verifies against exactly
 * that recorded key — the same primitive `@cogenta/plugins` already built
 * and tested (task 9/12), reused here rather than reimplemented, per this
 * project's established cross-package reuse pattern.
 */
describe('mutual authentication after pairing', () => {
  it('a signature made with the site private key verifies against its registered public key', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    const siteKeyPair = generateSigningKeyPair()

    const { token } = await store.issuePairingToken('client-a')
    const consumed = await store.consumePairingToken(token, siteKeyPair.publicKey)
    if (!consumed.ok) throw new Error('unreachable')

    const telemetry = { site: consumed.site.id, cveCount: 0, uptime: 0.999 }
    const signature = signContent(telemetry, siteKeyPair.privateKey)

    const registered = await store.getSite(consumed.site.id)
    expect(registered).not.toBeNull()
    expect(verifyContentSignature(telemetry, signature, registered?.publicKey ?? '')).toBe(true)
  })

  it('fails against a different site key, and against tampered content', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    const siteKeyPair = generateSigningKeyPair()
    const impostorKeyPair = generateSigningKeyPair()

    const { token } = await store.issuePairingToken('client-a')
    const consumed = await store.consumePairingToken(token, siteKeyPair.publicKey)
    if (!consumed.ok) throw new Error('unreachable')

    const telemetry = { site: consumed.site.id, cveCount: 0 }
    const signature = signContent(telemetry, siteKeyPair.privateKey)

    expect(verifyContentSignature(telemetry, signature, impostorKeyPair.publicKey)).toBe(false)
    expect(
      verifyContentSignature({ ...telemetry, cveCount: 3 }, signature, siteKeyPair.publicKey),
    ).toBe(false)
  })
})
