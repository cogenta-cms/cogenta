import { generateSigningKeyPair } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { signTelemetryPayload } from '../../src/agent/sign.js'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { ingestTelemetry } from '../../src/control/ingest.js'
import { createSiteStateStore } from '../../src/control/state.js'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { computeFleetBaseline, detectDrift, extractInventory } from '../../src/inventory/drift.js'
import { testDb } from '../helpers/db.js'

function samplePayload(
  siteId: string,
  pluginVersion: string,
  cms: string | null,
): TelemetryPayload {
  return {
    siteId,
    collectedAt: new Date().toISOString(),
    installedVersions: {
      cms,
      plugins: [{ name: 'seo-helper', version: pluginVersion }],
      themes: [],
    },
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

async function pairedSiteWithTelemetry(
  enrollment: ReturnType<typeof createEnrollmentStore>,
  state: ReturnType<typeof createSiteStateStore>,
  name: string,
  pluginVersion: string,
  cms: string | null = null,
) {
  const keyPair = generateSigningKeyPair()
  const { token } = await enrollment.issuePairingToken(name)
  const consumed = await enrollment.consumePairingToken(token, keyPair.publicKey)
  if (!consumed.ok) throw new Error('unreachable')

  const signed = signTelemetryPayload(
    samplePayload(consumed.site.id, pluginVersion, cms),
    keyPair.privateKey,
  )
  const result = await ingestTelemetry(signed, enrollment, state)
  if (!result.ok) throw new Error('unreachable')
  return { site: consumed.site, snapshot: result.snapshot }
}

describe('fleet inventory and drift detection', () => {
  it('extracts a real, component-oriented inventory from a real telemetry snapshot', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { snapshot } = await pairedSiteWithTelemetry(enrollment, state, 'client-a', '1.2.0')

    const inventory = extractInventory(snapshot)

    expect(inventory.components).toEqual([{ kind: 'plugin', name: 'seo-helper', version: '1.2.0' }])
  })

  it('computes the fleet baseline as the real most-common version, and flags the minority site as drifted', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)

    const a = await pairedSiteWithTelemetry(enrollment, state, 'client-a', '1.2.0')
    const b = await pairedSiteWithTelemetry(enrollment, state, 'client-b', '1.2.0')
    const c = await pairedSiteWithTelemetry(enrollment, state, 'client-c', '1.1.0')

    const inventories = [a, b, c].map(({ snapshot }) => extractInventory(snapshot))
    const baseline = computeFleetBaseline(inventories)

    expect(baseline.expectedVersion.get('plugin:seo-helper')).toBe('1.2.0')

    const drift = detectDrift(inventories, baseline)

    expect(drift).toEqual([
      {
        siteId: c.site.id,
        componentKind: 'plugin',
        componentName: 'seo-helper',
        version: '1.1.0',
        expectedVersion: '1.2.0',
        direction: 'behind',
      },
    ])
  })

  it('reports no drift when every site agrees with the baseline', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)

    const a = await pairedSiteWithTelemetry(enrollment, state, 'client-a', '2.0.0')
    const b = await pairedSiteWithTelemetry(enrollment, state, 'client-b', '2.0.0')

    const inventories = [a, b].map(({ snapshot }) => extractInventory(snapshot))
    const baseline = computeFleetBaseline(inventories)

    expect(detectDrift(inventories, baseline)).toEqual([])
  })

  it('reports a site ahead of the baseline as "ahead", using the real semver comparator', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)

    const a = await pairedSiteWithTelemetry(enrollment, state, 'client-a', '1.0.0')
    const b = await pairedSiteWithTelemetry(enrollment, state, 'client-b', '1.0.0')
    const c = await pairedSiteWithTelemetry(enrollment, state, 'client-c', '1.5.0')

    const inventories = [a, b, c].map(({ snapshot }) => extractInventory(snapshot))
    const baseline = computeFleetBaseline(inventories)
    const drift = detectDrift(inventories, baseline)

    expect(drift).toEqual([
      {
        siteId: c.site.id,
        componentKind: 'plugin',
        componentName: 'seo-helper',
        version: '1.5.0',
        expectedVersion: '1.0.0',
        direction: 'ahead',
      },
    ])
  })

  it('the honest CMS-version gap: a null cms version never produces a baseline entry or a drift entry', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)

    const a = await pairedSiteWithTelemetry(enrollment, state, 'client-a', '1.0.0', null)
    const b = await pairedSiteWithTelemetry(enrollment, state, 'client-b', '1.0.0', null)

    const inventories = [a, b].map(({ snapshot }) => extractInventory(snapshot))
    const baseline = computeFleetBaseline(inventories)

    expect(baseline.expectedVersion.has('cms:cms')).toBe(false)
    expect(detectDrift(inventories, baseline)).toEqual([])
  })

  it('reports a non-semver version mismatch as "different" rather than guessing a direction', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)

    const a = await pairedSiteWithTelemetry(enrollment, state, 'client-a', 'dev-build')
    const b = await pairedSiteWithTelemetry(enrollment, state, 'client-b', 'dev-build')
    const c = await pairedSiteWithTelemetry(enrollment, state, 'client-c', '1.0.0')

    const inventories = [a, b, c].map(({ snapshot }) => extractInventory(snapshot))
    const baseline = computeFleetBaseline(inventories)
    const drift = detectDrift(inventories, baseline)

    expect(drift).toEqual([
      {
        siteId: c.site.id,
        componentKind: 'plugin',
        componentName: 'seo-helper',
        version: '1.0.0',
        expectedVersion: 'dev-build',
        direction: 'different',
      },
    ])
  })
})
