import { generateSigningKeyPair } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { signTelemetryPayload } from '../../src/agent/sign.js'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { createAlertConditionStore } from '../../src/alerts/conditions.js'
import { createCommandQueueStore } from '../../src/control/commands.js'
import { generateControlPlaneIdentity } from '../../src/control/identity.js'
import { ingestTelemetry } from '../../src/control/ingest.js'
import type { SiteRisk } from '../../src/control/risk.js'
import { createSiteStateStore } from '../../src/control/state.js'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { createReportScheduleStore } from '../../src/reporting/schedule.js'
import { createRolloutCampaignStore } from '../../src/rollout/campaign.js'
import { testDb } from '../helpers/db.js'

/**
 * L8 task 11, the lot's own last task — "## Isolation de la mémoire des
 * agents": "un agent opérant sur le site A ne doit jamais avoir en mémoire
 * quoi que ce soit du site B". `@cogenta/agents`'s `MemoryStore` contract
 * (`packages/agents/test/memory/memory-store.contract.ts`, "never lets one
 * site's query see another site's records") already proves that half of the
 * lot's isolation requirement, on the package that actually owns agent
 * memory — not duplicated here.
 *
 * This suite proves the other half, the one that belongs to `@cogenta/fleet`
 * itself: every real per-site store the control plane holds — telemetry
 * state, commands, alert conditions, report schedules, rollout wave
 * membership — never answers one site's query with another site's data, and
 * the ingestion boundary refuses an explicit cross-site impersonation
 * attempt, not just a signature made with an unregistered key.
 *
 * `@cogenta/fleet` never touches `MemoryStore` at all — no live
 * `AgentRegistry` exists anywhere in this codebase (the same R2-honest
 * finding repeated across L5/L7/L9/L8) — so there is no reachable path today
 * for one site's agent memory to leak through this package specifically.
 */

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

describe('ingestTelemetry — cross-site impersonation attempt', () => {
  it('refuses site A, genuinely paired, submitting a payload that claims to be site B', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { site: siteA, keyPair: keyPairA } = await pairedSite(enrollment, 'agency-client-a')
    const { site: siteB } = await pairedSite(enrollment, 'agency-client-b')

    // Site A signs with its own real, registered private key — the
    // signature itself is genuine — but claims site B's identity in the
    // payload. `ingestTelemetry` must verify against the CLAIMED site's
    // registered public key (site B's), not the actual signer's, so this
    // fails verification even though the signature is real.
    const impersonating = signTelemetryPayload(samplePayload(siteB.id), keyPairA.privateKey)
    const result = await ingestTelemetry(impersonating, enrollment, state)

    expect(result).toEqual({ ok: false, reason: 'invalid_signature', message: expect.any(String) })
    expect(await state.latest(siteA.id)).toBeNull()
    expect(await state.latest(siteB.id)).toBeNull()
  })
})

describe('SiteStateStore — per-site telemetry isolation', () => {
  it('never answers one site’s history/latest query with another site’s snapshots', async () => {
    const db = await testDb()
    const enrollment = createEnrollmentStore(db)
    const state = createSiteStateStore(db)
    const { site: siteA, keyPair: keyPairA } = await pairedSite(enrollment, 'client-a')
    const { site: siteB, keyPair: keyPairB } = await pairedSite(enrollment, 'client-b')

    await ingestTelemetry(
      signTelemetryPayload(samplePayload(siteA.id), keyPairA.privateKey),
      enrollment,
      state,
    )
    await ingestTelemetry(
      signTelemetryPayload(samplePayload(siteB.id), keyPairB.privateKey),
      enrollment,
      state,
    )

    const latestA = await state.latest(siteA.id)
    const latestB = await state.latest(siteB.id)
    expect(latestA?.siteId).toBe(siteA.id)
    expect(latestB?.siteId).toBe(siteB.id)

    const historyA = await state.history(siteA.id)
    const historyB = await state.history(siteB.id)
    expect(historyA.every((snapshot) => snapshot.siteId === siteA.id)).toBe(true)
    expect(historyB.every((snapshot) => snapshot.siteId === siteB.id)).toBe(true)
  })
})

describe('CommandQueueStore — per-site command isolation', () => {
  it('a command queued for site A never appears in site B’s fetchPending', async () => {
    const db = await testDb()
    const identity = generateControlPlaneIdentity()
    const commands = createCommandQueueStore(db, identity)

    await commands.enqueue('site-a', 'update', { componentName: 'seo-toolkit' })
    await commands.enqueue('site-a', 'rollback', { componentName: 'seo-toolkit' })

    const pendingForB = await commands.fetchPending('site-b')
    expect(pendingForB).toEqual([])

    const pendingForA = await commands.fetchPending('site-a')
    expect(pendingForA).toHaveLength(2)
    expect(pendingForA.every((c) => c.command.siteId === 'site-a')).toBe(true)
  })
})

describe('ReportScheduleStore — per-site schedule isolation', () => {
  it('recording a sent report for site A never affects site B’s schedule', async () => {
    const db = await testDb()
    const schedule = createReportScheduleStore(db)

    await schedule.recordSent('site-a')

    expect(await schedule.lastSentAt('site-a')).not.toBeNull()
    expect(await schedule.lastSentAt('site-b')).toBeNull()
  })
})

describe('AlertConditionStore — per-site condition isolation', () => {
  it('tracks (site, condition) independently — confirmed adversarially, not just by convention', async () => {
    const db = await testDb()
    const conditions = createAlertConditionStore(db)

    const raisedA = await conditions.raise('site-a', 'critical-risk')
    expect(raisedA).toEqual({ fired: true })
    expect(await conditions.isActive('site-b', 'critical-risk')).toBe(false)

    const raisedB = await conditions.raise('site-b', 'critical-risk')
    expect(raisedB).toEqual({ fired: true }) // not suppressed by site A's already-active alert

    await conditions.clear('site-a', 'critical-risk')
    expect(await conditions.isActive('site-b', 'critical-risk')).toBe(true) // clearing A never clears B
  })
})

describe('RolloutCampaignStore — per-site wave-record isolation', () => {
  it('a site’s rollout record is never returned for another site in the same campaign', async () => {
    const db = await testDb()
    const identity = generateControlPlaneIdentity()
    const commands = createCommandQueueStore(db, identity)
    const state = createSiteStateStore(db)
    const rollout = createRolloutCampaignStore(db, commands, state)

    const risks: SiteRisk[] = [
      { siteId: 'site-a', siteName: 'A', client: 'agency', score: 0, tier: 'low', reasons: [] },
      { siteId: 'site-b', siteName: 'B', client: 'agency', score: 0, tier: 'low', reasons: [] },
    ]
    const campaign = await rollout.startCampaign({
      siteIds: ['site-a', 'site-b'],
      risks,
      componentKind: 'plugin',
      componentName: 'seo-toolkit',
      targetVersion: '2.0.0',
    })

    const recordsForA = await rollout.getSiteRolloutRecords(campaign.id, 'site-a')
    const recordsForB = await rollout.getSiteRolloutRecords(campaign.id, 'site-b')

    expect(recordsForA.every((r) => r.siteId === 'site-a')).toBe(true)
    expect(recordsForB.every((r) => r.siteId === 'site-b')).toBe(true)
    // Whichever site actually got dispatched a wave, the OTHER site's
    // records array must never contain it — the real traversal attempt.
    expect(recordsForA.some((r) => recordsForB.includes(r))).toBe(false)
  })
})
