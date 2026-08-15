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
import { createRolloutCampaignStore } from '../../src/rollout/campaign.js'
import { listRollbackCandidates, triggerRollback } from '../../src/rollout/rollback.js'
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

function flatRisks(sites: readonly SiteRegistration[]): SiteRisk[] {
  return sites.map((site, index) => ({
    siteId: site.id,
    siteName: site.name,
    client: site.client,
    score: index,
    tier: 'low' as const,
    reasons: [],
  }))
}

describe('per-site rollback: real integration against a halted campaign and the real command queue', () => {
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

  async function haltedCampaignFixture() {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    let clock = Date.now()
    const now = () => clock

    const enrollment = createEnrollmentStore(db, now, controlPlane)
    const state = createSiteStateStore(db, now)
    const commandQueue = createCommandQueueStore(db, controlPlane, now)
    const rollout = createRolloutCampaignStore(db, commandQueue, state, now)

    // 20 real sites — the smallest fleet size where `planWaves` gives the
    // 10% wave 2 real members (`ceil(20 * 0.1) = 2`), matching task 7's own
    // real test fixture exactly rather than assuming a smaller count works.
    const paired: { site: SiteRegistration; privateKey: string }[] = []
    for (let i = 0; i < 20; i += 1) {
      paired.push(await pairedSite(enrollment, `site-${i}`))
    }
    for (const { site, privateKey } of paired) {
      await reportVersion(enrollment, state, site, privateKey, '1.0.0')
    }

    const campaign = await rollout.startCampaign({
      siteIds: paired.map((p) => p.site.id),
      risks: flatRisks(paired.map((p) => p.site)),
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.1.0',
    })

    // Canary succeeds. A site's real contact cycle both fetches its pending
    // commands AND pushes telemetry — draining the dispatched `update`
    // command here (never inspecting it further; task 7's honest scope) is
    // what a real site does, so it must not linger as "pending" afterwards.
    clock += 1000
    const canaryId = must(campaign.waves[0]).siteIds[0]
    const canary = must(paired.find((p) => p.site.id === canaryId))
    await commandQueue.fetchPending(canary.site.id)
    await reportVersion(enrollment, state, canary.site, canary.privateKey, '1.1.0')
    const afterCanary = await rollout.checkProgress(campaign.id, now)

    // Wave 2 (10%, real 2 members): one succeeds, one is the injected
    // failure (reports back on a DIFFERENT version — the update never took).
    clock += 1000
    const wave2 = must(afterCanary.waves[1])
    const [goodId, badId] = wave2.siteIds
    const good = must(paired.find((p) => p.site.id === goodId))
    const bad = must(paired.find((p) => p.site.id === badId))
    await commandQueue.fetchPending(good.site.id)
    await commandQueue.fetchPending(bad.site.id)
    await reportVersion(enrollment, state, good.site, good.privateKey, '1.1.0')
    await reportVersion(enrollment, state, bad.site, bad.privateKey, '1.0.0')
    const halted = await rollout.checkProgress(campaign.id, now)

    return { halted, rollout, commandQueue, badSite: bad.site }
  }

  it('lists the real failed site as a rollback candidate, carrying its real pre-update version', async () => {
    const { halted, rollout, badSite } = await haltedCampaignFixture()

    expect(halted.status).toBe('halted')
    const candidates = await listRollbackCandidates(rollout, halted)

    expect(candidates).toEqual([
      {
        siteId: badSite.id,
        componentKind: 'plugin',
        componentName: 'seo-helper',
        rollbackToVersion: '1.0.0',
      },
    ])
  })

  it('returns no candidates for a campaign that is still in progress or fully succeeded', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    const enrollment = createEnrollmentStore(db, Date.now, controlPlane)
    const state = createSiteStateStore(db)
    const commandQueue = createCommandQueueStore(db, controlPlane)
    const rollout = createRolloutCampaignStore(db, commandQueue, state)

    const only = await pairedSite(enrollment, 'only')
    await reportVersion(enrollment, state, only.site, only.privateKey, '1.0.0')
    const campaign = await rollout.startCampaign({
      siteIds: [only.site.id],
      risks: flatRisks([only.site]),
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.1.0',
    })

    expect(campaign.status).toBe('in_progress')
    expect(await listRollbackCandidates(rollout, campaign)).toEqual([])
  })

  it('propose, not act: a halted campaign never auto-enqueues a rollback command by itself', async () => {
    const { badSite, commandQueue } = await haltedCampaignFixture()
    // `haltedCampaignFixture` only ran `checkProgress` — never called
    // `triggerRollback` — so the failed site must have nothing pending yet.
    expect(await commandQueue.fetchPending(badSite.id)).toHaveLength(0)
  })

  it('triggerRollback enqueues a real, signed rollback command for exactly the one site named', async () => {
    const { halted, rollout, commandQueue, badSite } = await haltedCampaignFixture()
    const candidate = must((await listRollbackCandidates(rollout, halted))[0])

    const command = await triggerRollback(
      commandQueue,
      candidate.siteId,
      candidate.componentKind,
      candidate.componentName,
      candidate.rollbackToVersion,
    )
    expect(command.action).toBe('rollback')
    expect(command.siteId).toBe(badSite.id)

    const pending = await commandQueue.fetchPending(badSite.id)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.command.payload).toEqual({
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.0.0',
    })
  })

  it('refuses to enqueue a rollback with no known prior version — nothing real to roll back to', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    const commandQueue = createCommandQueueStore(db, controlPlane)

    await expect(
      triggerRollback(commandQueue, 'some-site', 'plugin', 'seo-helper', null),
    ).rejects.toThrow(/nothing to roll back to/)
  })

  it('per-site isolation: triggering rollback for one site never enqueues anything for another', async () => {
    const { halted, rollout, commandQueue } = await haltedCampaignFixture()
    const candidate = must((await listRollbackCandidates(rollout, halted))[0])

    await triggerRollback(
      commandQueue,
      candidate.siteId,
      candidate.componentKind,
      candidate.componentName,
      candidate.rollbackToVersion,
    )

    for (const siteId of halted.waves.flatMap((w) => w.siteIds)) {
      if (siteId === candidate.siteId) continue
      expect(await commandQueue.fetchPending(siteId)).toHaveLength(0)
    }
  })
})
