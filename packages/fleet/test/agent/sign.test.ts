import { generateSigningKeyPair } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { signTelemetryPayload, verifyTelemetrySignature } from '../../src/agent/sign.js'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { testDb } from '../helpers/db.js'

function samplePayload(siteId: string): TelemetryPayload {
  return {
    siteId,
    collectedAt: new Date().toISOString(),
    installedVersions: { cms: null, plugins: [], themes: [] },
    sbomFingerprint: 'a'.repeat(64),
    openCves: [],
    coreWebVitalsAggregate: null,
    availability: { uptimeRatio: null },
    backups: { lastBackupAt: null, lastResult: 'unknown' },
    certificateExpiry: null,
    adminAccounts: { count: 1, mfaEnabledCount: 1 },
    aggregatedErrors: {
      count: 0,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString(),
    },
  }
}

describe('signTelemetryPayload / verifyTelemetrySignature', () => {
  it('a payload signed with a real paired site key verifies against its registered public key', async () => {
    const db = await testDb()
    const store = createEnrollmentStore(db)
    const siteKeyPair = generateSigningKeyPair()

    const { token } = await store.issuePairingToken('client-a')
    const consumed = await store.consumePairingToken(token, siteKeyPair.publicKey)
    if (!consumed.ok) throw new Error('unreachable')

    const signed = signTelemetryPayload(samplePayload(consumed.site.id), siteKeyPair.privateKey)

    const registered = await store.getSite(consumed.site.id)
    expect(verifyTelemetrySignature(signed, registered?.publicKey ?? '')).toBe(true)
  })

  it('fails verification against a different site key or tampered content', async () => {
    const siteKeyPair = generateSigningKeyPair()
    const impostorKeyPair = generateSigningKeyPair()
    const signed = signTelemetryPayload(samplePayload('site-1'), siteKeyPair.privateKey)

    expect(verifyTelemetrySignature(signed, impostorKeyPair.publicKey)).toBe(false)

    const tampered = { ...signed, payload: { ...signed.payload, siteId: 'site-2' } }
    expect(verifyTelemetrySignature(tampered, siteKeyPair.publicKey)).toBe(false)
  })

  it('refuses to sign a payload carrying a forbidden field, before any bytes are produced', () => {
    const siteKeyPair = generateSigningKeyPair()
    const withLeak = { ...samplePayload('site-1'), content: { title: 'leak' } } as TelemetryPayload
    expect(() => signTelemetryPayload(withLeak, siteKeyPair.privateKey)).toThrowError(/content/)
  })
})
