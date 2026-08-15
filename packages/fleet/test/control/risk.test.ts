import { describe, expect, it } from 'vitest'
import type { TelemetryPayload } from '../../src/agent/types.js'
import {
  computeSiteRisk,
  filterRisks,
  groupRisksByClient,
  rankSitesByRisk,
} from '../../src/control/risk.js'
import type { TelemetrySnapshot } from '../../src/control/state.js'
import type { SiteRegistration } from '../../src/enrollment/store.js'
import type { DriftEntry } from '../../src/inventory/drift.js'

function site(id: string, name: string, client: string | null = null): SiteRegistration {
  return {
    id,
    name,
    publicKey: 'fake-key',
    registeredAt: new Date().toISOString(),
    revoked: false,
    revokedAt: null,
    client,
  }
}

function payload(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    siteId: 'unused',
    collectedAt: new Date().toISOString(),
    installedVersions: { cms: null, plugins: [], themes: [] },
    sbomFingerprint: 'a'.repeat(64),
    openCves: [],
    coreWebVitalsAggregate: null,
    availability: { uptimeRatio: null },
    backups: { lastBackupAt: null, lastResult: 'unknown' },
    certificateExpiry: null,
    adminAccounts: { count: 2, mfaEnabledCount: 2 },
    aggregatedErrors: {
      count: 0,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString(),
    },
    ...overrides,
  }
}

function snapshot(siteId: string, overrides: Partial<TelemetryPayload> = {}): TelemetrySnapshot {
  return {
    id: `snap-${siteId}`,
    siteId,
    collectedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    payload: payload({ siteId, ...overrides }),
  }
}

describe('computeSiteRisk', () => {
  it('scores a clean site with no open CVEs, full MFA and no drift at zero', () => {
    const risk = computeSiteRisk(site('s1', 'clean-site'), snapshot('s1'), [])
    expect(risk.score).toBe(0)
    expect(risk.tier).toBe('low')
    expect(risk.reasons).toEqual([])
  })

  it('a single open critical CVE alone reaches the critical tier', () => {
    const risk = computeSiteRisk(
      site('s1', 'cve-site'),
      snapshot('s1', {
        openCves: [{ id: 'CVE-2026-0001', urgency: 'critical', status: 'open' }],
      }),
      [],
    )
    expect(risk.tier).toBe('critical')
    expect(risk.reasons.map((r) => r.code)).toEqual(['cve'])
  })

  it('a patched CVE contributes nothing — only status "open" counts', () => {
    const risk = computeSiteRisk(
      site('s1', 'patched-site'),
      snapshot('s1', {
        openCves: [{ id: 'CVE-2026-0002', urgency: 'critical', status: 'patched' }],
      }),
      [],
    )
    expect(risk.score).toBe(0)
  })

  it('admin accounts missing MFA contribute real, scaled points', () => {
    const risk = computeSiteRisk(
      site('s1', 'mfa-gap-site'),
      snapshot('s1', { adminAccounts: { count: 3, mfaEnabledCount: 1 } }),
      [],
    )
    expect(risk.reasons).toEqual([
      { code: 'mfa-gap', detail: '2/3 admin account(s) without MFA', points: 16 },
    ])
  })

  it('version drift contributes bounded points, never fabricated from a shape-only field', () => {
    const drift: DriftEntry = {
      siteId: 's1',
      componentKind: 'plugin',
      componentName: 'example',
      version: '1.0.0',
      expectedVersion: '2.0.0',
      direction: 'behind',
    }
    const risk = computeSiteRisk(site('s1', 'drift-site'), snapshot('s1'), [drift])
    expect(risk.reasons).toEqual([
      {
        code: 'version-drift',
        detail: '1 component(s) drifted from the fleet baseline',
        points: 6,
      },
    ])
  })

  it('a site with no telemetry at all is real risk, not a clean score', () => {
    const risk = computeSiteRisk(site('s1', 'silent-site'), null, [])
    expect(risk.score).toBeGreaterThan(0)
    expect(risk.tier).not.toBe('low')
  })
})

describe('rankSitesByRisk', () => {
  it('the literal acceptance criterion: a site with a critical CVE ranks first, regardless of input order', () => {
    const criticalSite = site('critical', 'zzz-last-alphabetically')
    const driftedSite = site('drifted', 'aaa-first-alphabetically')
    const cleanSite = site('clean', 'mmm-middle')

    const ranked = rankSitesByRisk([
      // Deliberately NOT in risk order, and the highest-risk site sorts
      // last alphabetically — proves this is real risk sorting, not a
      // disguised name sort.
      {
        site: cleanSite,
        snapshot: snapshot('clean'),
        driftEntries: [],
      },
      {
        site: driftedSite,
        snapshot: snapshot('drifted'),
        driftEntries: [
          {
            siteId: 'drifted',
            componentKind: 'plugin',
            componentName: 'p',
            version: '1.0.0',
            expectedVersion: '2.0.0',
            direction: 'behind',
          },
        ],
      },
      {
        site: criticalSite,
        snapshot: snapshot('critical', {
          openCves: [{ id: 'CVE-2026-1234', urgency: 'critical', status: 'open' }],
        }),
        driftEntries: [],
      },
    ])

    expect(ranked.map((r) => r.siteId)).toEqual(['critical', 'drifted', 'clean'])
  })

  it('ties break on site name, ascending — deterministic, not insertion order', () => {
    const ranked = rankSitesByRisk([
      { site: site('b', 'bravo'), snapshot: snapshot('b'), driftEntries: [] },
      { site: site('a', 'alpha'), snapshot: snapshot('a'), driftEntries: [] },
    ])
    expect(ranked.map((r) => r.siteName)).toEqual(['alpha', 'bravo'])
  })
})

describe('filterRisks and groupRisksByClient — designed for a hundred sites', () => {
  const risks = rankSitesByRisk([
    { site: site('1', 'acme-blog', 'acme'), snapshot: snapshot('1'), driftEntries: [] },
    {
      site: site('2', 'acme-shop', 'acme'),
      snapshot: snapshot('2', {
        openCves: [{ id: 'CVE-1', urgency: 'high', status: 'open' }],
      }),
      driftEntries: [],
    },
    { site: site('3', 'globex-site', 'globex'), snapshot: snapshot('3'), driftEntries: [] },
    { site: site('4', 'unlabeled-site', null), snapshot: snapshot('4'), driftEntries: [] },
  ])

  it('filters by exact client', () => {
    const filtered = filterRisks(risks, { client: 'acme' })
    expect(filtered.map((r) => r.siteName).sort()).toEqual(['acme-blog', 'acme-shop'])
  })

  it('filters by minimum risk tier', () => {
    const filtered = filterRisks(risks, { minTier: 'high' })
    expect(filtered.map((r) => r.siteName)).toEqual(['acme-shop'])
  })

  it('filters by case-insensitive search over name and client', () => {
    expect(filterRisks(risks, { search: 'GLOBEX' }).map((r) => r.siteName)).toEqual(['globex-site'])
    expect(filterRisks(risks, { search: 'shop' }).map((r) => r.siteName)).toEqual(['acme-shop'])
  })

  it('groups by client, keeping a null-client site as its own real group', () => {
    const groups = groupRisksByClient(risks)
    expect(
      groups
        .get('acme')
        ?.map((r) => r.siteName)
        .sort(),
    ).toEqual(['acme-blog', 'acme-shop'])
    expect(groups.get('globex')?.map((r) => r.siteName)).toEqual(['globex-site'])
    expect(groups.get(null)?.map((r) => r.siteName)).toEqual(['unlabeled-site'])
  })
})
