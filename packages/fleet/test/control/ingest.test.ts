import { generateSigningKeyPair } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { signTelemetryPayload } from '../../src/agent/sign.js'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { ingestTelemetry } from '../../src/control/ingest.js'
import { createSiteStateStore } from '../../src/control/state.js'
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

async function pairedSite(enrollment: ReturnType<typeof createEnrollmentStore>, name: string) {
  const keyPair = generateSigningKeyPair()
  const { token } = await enrollment.issuePairingToken(name)
  const consumed = await enrollment.consumePairingToken(token, keyPair.publicKey)
  if (!consumed.ok) throw new Error('unreachable')
  return { site: consumed.site, keyPair }
}

describe('ingestTelemetry', () => {
  it('accepts a real, validly signed payload from an actually-paired site and records it', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { site, keyPair } = await pairedSite(enrollment, 'client-a')

    const signed = signTelemetryPayload(samplePayload(site.id), keyPair.privateKey)
    const result = await ingestTelemetry(signed, enrollment, state)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.snapshot.siteId).toBe(site.id)
    expect(await state.latest(site.id)).toEqual(result.snapshot)
  })

  it('rejects an unknown site id', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const keyPair = generateSigningKeyPair()

    const signed = signTelemetryPayload(samplePayload('never-paired'), keyPair.privateKey)
    const result = await ingestTelemetry(signed, enrollment, state)

    expect(result).toEqual({
      ok: false,
      reason: 'unknown_site',
      message: expect.stringContaining('never-paired'),
    })
    expect(await state.latest('never-paired')).toBeNull()
  })

  it('rejects telemetry from a revoked site even with an otherwise-valid signature', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { site, keyPair } = await pairedSite(enrollment, 'client-b')
    await enrollment.revokeSite(site.id)

    const signed = signTelemetryPayload(samplePayload(site.id), keyPair.privateKey)
    const result = await ingestTelemetry(signed, enrollment, state)

    expect(result).toEqual({ ok: false, reason: 'revoked', message: expect.any(String) })
    expect(await state.latest(site.id)).toBeNull()
  })

  it('rejects a payload signed with the wrong key', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { site } = await pairedSite(enrollment, 'client-c')
    const impostorKeyPair = generateSigningKeyPair()

    const signed = signTelemetryPayload(samplePayload(site.id), impostorKeyPair.privateKey)
    const result = await ingestTelemetry(signed, enrollment, state)

    expect(result).toEqual({ ok: false, reason: 'invalid_signature', message: expect.any(String) })
    expect(await state.latest(site.id)).toBeNull()
  })

  it('rejects a payload with a forbidden field smuggled past the sender-side type system, even though it verifies', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { site, keyPair } = await pairedSite(enrollment, 'client-d')

    // Bypass `signTelemetryPayload`'s own sender-side check entirely — this
    // proves the control plane does not just trust a well-behaved sender.
    const { signContent } = await import('@cogenta/plugins')
    const leaking = {
      ...samplePayload(site.id),
      adminAccounts: { count: 1, mfaEnabledCount: 1, apiKey: 'sk-leaked' },
    } as unknown as TelemetryPayload
    const signed = {
      payload: leaking,
      signatureBase64: signContent(leaking, keyPair.privateKey),
    }

    const result = await ingestTelemetry(signed, enrollment, state)

    expect(result).toEqual({
      ok: false,
      reason: 'forbidden_field',
      message: expect.stringContaining('apiKey'),
    })
    expect(await state.latest(site.id)).toBeNull()
  })
})
