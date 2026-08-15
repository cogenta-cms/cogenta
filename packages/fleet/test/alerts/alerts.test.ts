import type { DatabaseHandle } from '@cogenta/core'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  detectCampaignHaltedAlert,
  detectCriticalRiskAlert,
  detectSiteSilentAlert,
  dispatchAlert,
  raiseIfNew,
} from '../../src/alerts/alerts.js'
import { createAlertConditionStore } from '../../src/alerts/conditions.js'
import type { SiteRisk } from '../../src/control/risk.js'
import type { TelemetrySnapshot } from '../../src/control/state.js'
import type { SiteRegistration } from '../../src/enrollment/store.js'
import type { CampaignRecord } from '../../src/rollout/campaign.js'
import { testDb } from '../helpers/db.js'

const SITE: SiteRegistration = {
  id: 'site-1',
  name: 'Boulangerie Dupont',
  publicKey: 'unused-in-this-test',
  registeredAt: '2026-01-01T00:00:00.000Z',
  revoked: false,
  revokedAt: null,
  client: 'Agence Nord',
}

function risk(overrides: Partial<SiteRisk> = {}): SiteRisk {
  return {
    siteId: SITE.id,
    siteName: SITE.name,
    client: SITE.client,
    score: 0,
    tier: 'low',
    reasons: [],
    ...overrides,
  }
}

function campaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: 'campaign-1',
    componentKind: 'plugin',
    componentName: 'seo-toolkit',
    targetVersion: '2.0.0',
    waves: [],
    currentWaveIndex: 0,
    status: 'in_progress',
    haltedReason: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    failedSiteIds: [],
    ...overrides,
  }
}

function snapshotAt(ingestedAt: string): TelemetrySnapshot {
  return {
    id: 'snap-1',
    siteId: SITE.id,
    collectedAt: ingestedAt,
    ingestedAt,
    payload: {
      siteId: SITE.id,
      collectedAt: ingestedAt,
      installedVersions: { cms: null, plugins: [], themes: [] },
      sbomFingerprint: 'deadbeef',
      openCves: [],
      coreWebVitalsAggregate: null,
      availability: { uptimeRatio: null },
      backups: { lastBackupAt: null, lastResult: 'unknown' },
      certificateExpiry: null,
      adminAccounts: { count: 1, mfaEnabledCount: 1 },
      aggregatedErrors: { count: 0, windowStart: '', windowEnd: '' },
    },
  }
}

describe('detectCriticalRiskAlert', () => {
  it('produces a real alert for a critical-tier site', () => {
    const message = detectCriticalRiskAlert(
      risk({
        tier: 'critical',
        score: 100,
        reasons: [{ code: 'cve', detail: 'CVE-2026-1 (critical, open)', points: 100 }],
      }),
    )
    expect(message).not.toBeNull()
    expect(message?.level).toBe('alert')
    expect(message?.severity).toBe('critical')
    expect(message?.context).toContain('CVE-2026-1')
  })

  it('produces nothing for a non-critical site', () => {
    expect(detectCriticalRiskAlert(risk({ tier: 'high' }))).toBeNull()
    expect(detectCriticalRiskAlert(risk({ tier: 'low' }))).toBeNull()
  })
})

describe('detectCampaignHaltedAlert', () => {
  const names = new Map([[SITE.id, SITE.name]])

  it('produces a real alert for a halted campaign, naming the real failed site', () => {
    const message = detectCampaignHaltedAlert(
      campaign({ status: 'halted', haltedReason: null, failedSiteIds: [SITE.id] }),
      names,
    )
    expect(message).not.toBeNull()
    expect(message?.severity).toBe('critical')
    expect(message?.context).toContain(SITE.name)
  })

  it('produces nothing for an in-progress or succeeded campaign', () => {
    expect(detectCampaignHaltedAlert(campaign({ status: 'in_progress' }), names)).toBeNull()
    expect(detectCampaignHaltedAlert(campaign({ status: 'succeeded' }), names)).toBeNull()
  })
})

describe('detectSiteSilentAlert — anti-flapping', () => {
  const dayMs = 24 * 60 * 60 * 1000
  const lastContact = Date.parse('2026-02-01T00:00:00.000Z')

  it('does not alert on a single missed contact window', () => {
    const now = () => lastContact + 1 * dayMs + 1000
    const message = detectSiteSilentAlert(
      SITE,
      snapshotAt(new Date(lastContact).toISOString()),
      now,
    )
    expect(message).toBeNull()
  })

  it('does not alert on two missed windows', () => {
    const now = () => lastContact + 2 * dayMs + 1000
    const message = detectSiteSilentAlert(
      SITE,
      snapshotAt(new Date(lastContact).toISOString()),
      now,
    )
    expect(message).toBeNull()
  })

  it('alerts once three consecutive contact windows are missed — the real, sustained-absence threshold', () => {
    const now = () => lastContact + 3 * dayMs + 1000
    const message = detectSiteSilentAlert(
      SITE,
      snapshotAt(new Date(lastContact).toISOString()),
      now,
    )
    expect(message).not.toBeNull()
    expect(message?.severity).toBe('warning')
  })

  it('treats a never-reporting site the same way, counting from its real registration time', () => {
    const now = () => new Date(SITE.registeredAt).getTime() + 3 * dayMs + 1000
    const message = detectSiteSilentAlert(SITE, null, now)
    expect(message).not.toBeNull()
  })
})

describe('raiseIfNew — real de-duplication wired to the condition store', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  it('returns the message on first fire, null on every repeat while the condition holds', async () => {
    const store = createAlertConditionStore(db)
    const message = detectCriticalRiskAlert(risk({ tier: 'critical', score: 90 }))

    const first = await raiseIfNew(store, SITE.id, 'critical-risk', message)
    expect(first).toBe(message)

    const second = await raiseIfNew(store, SITE.id, 'critical-risk', message)
    expect(second).toBeNull()
  })

  it('clears the condition and dispatch actually calls the sender exactly once per fired alert', async () => {
    const store = createAlertConditionStore(db)
    const sent: string[] = []
    const sender = { send: async (m: { title: string }) => void sent.push(m.title) }

    const criticalMessage = detectCriticalRiskAlert(risk({ tier: 'critical', score: 90 }))
    const first = await raiseIfNew(store, SITE.id, 'critical-risk', criticalMessage)
    if (first !== null) await dispatchAlert(sender, first)

    const stillCritical = await raiseIfNew(store, SITE.id, 'critical-risk', criticalMessage)
    if (stillCritical !== null) await dispatchAlert(sender, stillCritical)

    expect(sent).toHaveLength(1)

    // The risk clears — `raiseIfNew` receives `null` and clears the condition store.
    const cleared = await raiseIfNew(store, SITE.id, 'critical-risk', null)
    expect(cleared).toBeNull()
    expect(await store.isActive(SITE.id, 'critical-risk')).toBe(false)

    // The risk re-occurs later — fires again, a real second alert, never permanently suppressed.
    const reoccurred = await raiseIfNew(store, SITE.id, 'critical-risk', criticalMessage)
    expect(reoccurred).toBe(criticalMessage)
    if (reoccurred !== null) await dispatchAlert(sender, reoccurred)
    expect(sent).toHaveLength(2)
  })
})
