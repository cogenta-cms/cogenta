import { generateSigningKeyPair } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import { signTelemetryPayload } from '../../src/agent/sign.js'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { createCommandQueueStore } from '../../src/control/commands.js'
import { generateControlPlaneIdentity } from '../../src/control/identity.js'
import { ingestTelemetry } from '../../src/control/ingest.js'
import type { SiteRisk } from '../../src/control/risk.js'
import { createSiteStateStore } from '../../src/control/state.js'
import { createEnrollmentStore, type SiteRegistration } from '../../src/enrollment/store.js'
import {
  createRolloutCampaignStore,
  orderSitesForCanary,
  planWaves,
} from '../../src/rollout/campaign.js'
import { testDb } from '../helpers/db.js'

function samplePayload(siteId: string, pluginVersion: string): TelemetryPayload {
  return {
    siteId,
    collectedAt: new Date().toISOString(),
    installedVersions: {
      cms: null,
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

function must<T>(value: T | undefined): T {
  expect(value).toBeDefined()
  return value as T
}

describe('planWaves', () => {
  it('splits a 20-site fleet into canary(1), 10%(2), 50%(10), rest(7) — all distinct, non-empty', () => {
    const ids = Array.from({ length: 20 }, (_unused, i) => `site-${i}`)
    const waves = planWaves(ids)

    expect(waves.map((w) => w.siteIds.length)).toEqual([1, 2, 10, 7])
    expect(waves.map((w) => w.label)).toEqual(['canary', '10%', '50%', 'rest'])
    const allIds = waves.flatMap((w) => w.siteIds)
    expect(new Set(allIds).size).toBe(20) // no site appears in two waves
    expect(allIds).toEqual(ids) // order preserved, canary first
  })

  it('a single-site fleet is just a canary wave — no empty later waves', () => {
    const waves = planWaves(['only-site'])
    expect(waves).toEqual([{ index: 0, label: 'canary', siteIds: ['only-site'] }])
  })
})

describe('orderSitesForCanary', () => {
  it('orders lowest risk first — the safest real site becomes the canary', () => {
    const risks: SiteRisk[] = [
      {
        siteId: 'risky',
        siteName: 'risky',
        client: null,
        score: 90,
        tier: 'critical',
        reasons: [],
      },
      { siteId: 'safe', siteName: 'safe', client: null, score: 0, tier: 'low', reasons: [] },
      {
        siteId: 'medium',
        siteName: 'medium',
        client: null,
        score: 20,
        tier: 'medium',
        reasons: [],
      },
    ]
    const ordered = orderSitesForCanary(['risky', 'safe', 'medium'], risks)
    expect(ordered).toEqual(['safe', 'medium', 'risky'])
  })

  it('a site with no matching risk entry sorts last — never a safe-default canary', () => {
    const risks: SiteRisk[] = [
      { siteId: 'known', siteName: 'known', client: null, score: 50, tier: 'medium', reasons: [] },
    ]
    const ordered = orderSitesForCanary(['unknown', 'known'], risks)
    expect(ordered).toEqual(['known', 'unknown'])
  })
})

describe("rollout campaign: real integration against tasks 1-6's real infrastructure", () => {
  async function pairedSite(
    enrollment: ReturnType<typeof createEnrollmentStore>,
    name: string,
  ): Promise<{ site: SiteRegistration; privateKey: string }> {
    const keyPair = generateSigningKeyPair()
    const { token } = await enrollment.issuePairingToken(name)
    const consumed = await enrollment.consumePairingToken(token, keyPair.publicKey)
    if (!consumed.ok) throw new Error('unreachable in test setup')
    return { site: consumed.site, privateKey: keyPair.privateKey }
  }

  async function reportVersion(
    enrollment: ReturnType<typeof createEnrollmentStore>,
    state: ReturnType<typeof createSiteStateStore>,
    site: SiteRegistration,
    privateKey: string,
    version: string,
  ): Promise<void> {
    const signed = signTelemetryPayload(samplePayload(site.id, version), privateKey)
    const result = await ingestTelemetry(signed, enrollment, state)
    if (!result.ok) throw new Error('unreachable in test setup: real telemetry rejected')
  }

  function flatRisks(sites: readonly SiteRegistration[]): SiteRisk[] {
    // Deterministic, ascending "risk" purely by registration order, real
    // enough to drive `orderSitesForCanary` without needing the full
    // `computeSiteRisk` pipeline in this test's setup.
    return sites.map((site, index) => ({
      siteId: site.id,
      siteName: site.name,
      client: site.client,
      score: index,
      tier: 'low' as const,
      reasons: [],
    }))
  }

  it('a real campaign against 20 sites: canary succeeds, wave 2 has an injected failure, campaign halts before waves 3/4 ever get a command', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    // One real clock shared by every store in this test — mixing a fake,
    // manually-advanced clock (the rollout store) with real wall-clock
    // `Date.now()` (telemetry ingestion) would make "did this site's next
    // contact happen after dispatch" incomparable between the two time
    // bases. Every real deployment has exactly one clock; this test does too.
    let clock = Date.now()
    const now = () => clock

    const enrollment = createEnrollmentStore(db, now, controlPlane)
    const state = createSiteStateStore(db, now)
    const commandQueue = createCommandQueueStore(db, controlPlane, now)

    const paired: { site: SiteRegistration; privateKey: string }[] = []
    for (let i = 0; i < 20; i += 1) {
      paired.push(await pairedSite(enrollment, `site-${i}`))
    }
    // Every site starts on the old version, real telemetry, real signatures.
    for (const { site, privateKey } of paired) {
      await reportVersion(enrollment, state, site, privateKey, '1.0.0')
    }

    const rollout = createRolloutCampaignStore(db, commandQueue, state, now)
    const siteIds = paired.map((p) => p.site.id)
    const campaign = await rollout.startCampaign({
      siteIds,
      risks: flatRisks(paired.map((p) => p.site)),
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.1.0',
    })

    expect(campaign.status).toBe('in_progress')
    expect(campaign.currentWaveIndex).toBe(0)
    const canaryId = must(campaign.waves[0]).siteIds[0]
    expect(canaryId).toBeDefined()

    // Wave 3/4 sites must never have a command queued yet — the whole point
    // of a staged rollout.
    const wave3SiteId = must(must(campaign.waves[2]).siteIds[0])
    expect(await commandQueue.fetchPending(wave3SiteId)).toHaveLength(0)

    // --- Canary succeeds: it contacts again reporting the target version. ---
    clock += 1000
    const canarySite = must(paired.find((p) => p.site.id === canaryId))
    await reportVersion(enrollment, state, canarySite.site, canarySite.privateKey, '1.1.0')

    const afterCanary = await rollout.checkProgress(campaign.id, now)
    expect(afterCanary.status).toBe('in_progress')
    expect(afterCanary.currentWaveIndex).toBe(1) // advanced to the 10% wave

    const wave2 = must(afterCanary.waves[1])
    expect(wave2.siteIds.length).toBe(2)

    // Still nothing queued for wave 3/4.
    expect(await commandQueue.fetchPending(wave3SiteId)).toHaveLength(0)

    // --- Wave 2 (10%): one site succeeds, one is a genuine injected failure
    // (reports back on a DIFFERENT version — the update did not take). ---
    clock += 1000
    const [goodId, badId] = wave2.siteIds
    const good = must(paired.find((p) => p.site.id === goodId))
    const bad = must(paired.find((p) => p.site.id === badId))
    await reportVersion(enrollment, state, good.site, good.privateKey, '1.1.0')
    await reportVersion(enrollment, state, bad.site, bad.privateKey, '1.0.0') // injected failure

    const afterWave2 = await rollout.checkProgress(campaign.id, now)

    expect(afterWave2.status).toBe('halted')
    expect(afterWave2.haltedReason).toContain('10%')
    expect(afterWave2.failedSiteIds).toEqual([badId])

    // The literal acceptance criterion: waves 3 (50%) and 4 (rest) never
    // received an update command at all.
    for (const wave of [afterWave2.waves[2], afterWave2.waves[3]]) {
      for (const siteId of must(wave).siteIds) {
        expect(await commandQueue.fetchPending(siteId)).toHaveLength(0)
      }
    }

    // A second `checkProgress` call on an already-halted campaign is a real no-op.
    const rechecked = await rollout.checkProgress(campaign.id, now)
    expect(rechecked).toEqual(afterWave2)
  })

  it('a stalled site (no new contact within the timeout) counts as failure, not an indefinite wait', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    let clock = Date.now()
    const now = () => clock
    const enrollment = createEnrollmentStore(db, now, controlPlane)
    const state = createSiteStateStore(db, now)
    const commandQueue = createCommandQueueStore(db, controlPlane, now)

    const a = await pairedSite(enrollment, 'a')
    const b = await pairedSite(enrollment, 'b')
    await reportVersion(enrollment, state, a.site, a.privateKey, '1.0.0')
    await reportVersion(enrollment, state, b.site, b.privateKey, '1.0.0')

    const rollout = createRolloutCampaignStore(db, commandQueue, state, now)

    const campaign = await rollout.startCampaign({
      siteIds: [a.site.id, b.site.id],
      risks: flatRisks([a.site, b.site]),
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.1.0',
    })
    expect(campaign.waves[0]?.siteIds).toEqual([a.site.id])

    // The canary never contacts again — real bounded timeout elapses.
    clock += 25 * 60 * 60 * 1000 // past the 24h default timeout
    const result = await rollout.checkProgress(campaign.id, now, 24 * 60 * 60 * 1000)

    expect(result.status).toBe('halted')
    expect(result.failedSiteIds).toEqual([a.site.id])
  })

  it('a campaign survives being reloaded from real persisted storage (a fresh store instance) — real durability', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    const enrollment = createEnrollmentStore(db, Date.now, controlPlane)
    const state = createSiteStateStore(db)
    const commandQueue = createCommandQueueStore(db, controlPlane)

    const a = await pairedSite(enrollment, 'only-site')
    await reportVersion(enrollment, state, a.site, a.privateKey, '1.0.0')

    const rollout = createRolloutCampaignStore(db, commandQueue, state)
    const campaign = await rollout.startCampaign({
      siteIds: [a.site.id],
      risks: flatRisks([a.site]),
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.1.0',
    })

    // A fresh store instance against the SAME db — simulates a control-plane restart.
    const reloadedRollout = createRolloutCampaignStore(db, commandQueue, state)
    const reloaded = await reloadedRollout.getCampaign(campaign.id)

    expect(reloaded).not.toBeNull()
    expect(reloaded?.status).toBe('in_progress')
    expect(reloaded?.waves).toEqual(campaign.waves)
    expect(reloaded?.targetVersion).toBe('1.1.0')
  })
})
