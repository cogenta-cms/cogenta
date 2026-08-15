import { generateSigningKeyPair } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { signTelemetryPayload } from '../../src/agent/sign.js'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { ingestTelemetry } from '../../src/control/ingest.js'
import { createSiteStateStore } from '../../src/control/state.js'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { testDb } from '../helpers/db.js'

/**
 * "## Tests exigés": "Charge | 100 sites simulés émettant leur télémétrie."
 * A real number, not a round guess — "## Pièges connus" names 20-100 as the
 * real target fleet size for this whole lot ("Concevoir directement pour
 * cent"). Runs the actual signed-and-verified `ingestTelemetry` path (the
 * real security boundary, not a shortcut straight to `state.recordSnapshot`)
 * for every one of the 100 sites, and proves the same property task 11's
 * `cross-site.test.ts` proves at small scale still holds at the lot's real
 * target scale: no site's snapshot ever answers another site's query.
 */
function samplePayload(siteId: string, sequence: number): TelemetryPayload {
  return {
    siteId,
    collectedAt: new Date(2026, 0, 1, 0, 0, sequence).toISOString(),
    installedVersions: { cms: null, plugins: [], themes: [] },
    sbomFingerprint: sequence.toString().padStart(64, '0'),
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

const FLEET_SIZE = 100

describe('100 simulated sites emitting telemetry', () => {
  it('ingests all 100 real signed payloads with zero cross-site contamination', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)

    const sites = await Promise.all(
      Array.from({ length: FLEET_SIZE }, async (_unused, i) => {
        const keyPair = generateSigningKeyPair()
        const { token } = await enrollment.issuePairingToken(`load-test-site-${i}`)
        const consumed = await enrollment.consumePairingToken(token, keyPair.publicKey)
        if (!consumed.ok) throw new Error('unreachable')
        return { site: consumed.site, keyPair }
      }),
    )

    for (const [i, { site, keyPair }] of sites.entries()) {
      const signed = signTelemetryPayload(samplePayload(site.id, i), keyPair.privateKey)
      const result = await ingestTelemetry(signed, enrollment, state)
      expect(result.ok).toBe(true)
    }

    // Every site's own fingerprint comes back for its own query, and only
    // its own — the real traversal check, run across the whole fleet rather
    // than a pair of sites.
    for (const [i, { site }] of sites.entries()) {
      const latest = await state.latest(site.id)
      expect(latest?.siteId).toBe(site.id)
      expect(latest?.payload.sbomFingerprint).toBe(i.toString().padStart(64, '0'))
    }

    const allIds = new Set(sites.map(({ site }) => site.id))
    expect(allIds.size).toBe(FLEET_SIZE) // every registration produced a distinct site
  })
})
