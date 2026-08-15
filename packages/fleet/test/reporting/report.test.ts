import { describe, expect, it } from 'vitest'
import type { TelemetryPayload } from '../../src/agent/types.js'
import type { TelemetrySnapshot } from '../../src/control/state.js'
import type { SiteRegistration } from '../../src/enrollment/store.js'
import type { DriftEntry } from '../../src/inventory/drift.js'
import { assembleClientReport, renderClientReport } from '../../src/reporting/report.js'

const SITE: SiteRegistration = {
  id: 'site-1',
  name: 'Boulangerie Dupont',
  publicKey: 'unused-in-this-test',
  registeredAt: '2026-01-01T00:00:00.000Z',
  revoked: false,
  revokedAt: null,
  client: 'Agence Nord',
}

function payload(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    siteId: SITE.id,
    collectedAt: '2026-02-01T00:00:00.000Z',
    installedVersions: { cms: null, plugins: [], themes: [] },
    sbomFingerprint: 'deadbeef',
    openCves: [],
    coreWebVitalsAggregate: null,
    availability: { uptimeRatio: null },
    backups: { lastBackupAt: null, lastResult: 'unknown' },
    certificateExpiry: null,
    adminAccounts: { count: 1, mfaEnabledCount: 1 },
    aggregatedErrors: { count: 0, windowStart: '', windowEnd: '' },
    ...overrides,
  }
}

function snapshot(p: TelemetryPayload): TelemetrySnapshot {
  return {
    id: 'snap-1',
    siteId: SITE.id,
    collectedAt: p.collectedAt,
    ingestedAt: p.collectedAt,
    payload: p,
  }
}

describe('assembleClientReport', () => {
  it('marks every honest-gap field unavailable rather than fabricating a value, when no shape-only data exists', () => {
    const report = assembleClientReport(SITE, snapshot(payload()), [], () =>
      Date.parse('2026-02-15'),
    )

    expect(report.availability).toEqual({ available: false })
    expect(report.performance).toEqual({ available: false })
    expect(report.backups).toEqual({ available: false })
    expect(report.publishedContent).toEqual({ available: false })
    expect(report.agentActions).toEqual({ available: false })
  })

  it('reports real security incidents from real telemetry', () => {
    const report = assembleClientReport(
      SITE,
      snapshot(payload({ openCves: [{ id: 'CVE-2026-1', urgency: 'critical', status: 'open' }] })),
      [],
    )
    expect(report.securityIncidents).toEqual([{ urgency: 'critical', status: 'open' }])
  })

  it('reports real performance data when the site has real CrUX data', () => {
    const report = assembleClientReport(
      SITE,
      snapshot(payload({ coreWebVitalsAggregate: { lcpP75Ms: 1800 } })),
      [],
    )
    expect(report.performance).toEqual({ available: true, value: { lcpP75Ms: 1800 } })
  })

  it('reports real backups only when a real result exists, never "unknown" as a value', () => {
    const withBackup = assembleClientReport(
      SITE,
      snapshot(
        payload({ backups: { lastBackupAt: '2026-02-10T00:00:00.000Z', lastResult: 'success' } }),
      ),
      [],
    )
    expect(withBackup.backups).toEqual({
      available: true,
      value: { at: '2026-02-10T00:00:00.000Z', result: 'success' },
    })
  })

  it('filters version drift to only this site', () => {
    const drift: DriftEntry[] = [
      {
        siteId: SITE.id,
        componentKind: 'plugin',
        componentName: 'seo',
        version: '1.0.0',
        expectedVersion: '1.2.0',
        direction: 'behind',
      },
      {
        siteId: 'other-site',
        componentKind: 'plugin',
        componentName: 'seo',
        version: '1.0.0',
        expectedVersion: '1.2.0',
        direction: 'behind',
      },
    ]
    const report = assembleClientReport(SITE, snapshot(payload()), drift)
    expect(report.versionDrift).toHaveLength(1)
    expect(report.versionDrift[0]?.siteId).toBe(SITE.id)
  })

  it('a site with no telemetry ever received produces an honest all-unavailable report, not zeros', () => {
    const report = assembleClientReport(SITE, null, [])
    expect(report.availability).toEqual({ available: false })
    expect(report.securityIncidents).toEqual([])
    expect(report.performance).toEqual({ available: false })
  })
})

describe('renderClientReport — plain language, no raw technical identifiers', () => {
  it('never leaks a raw CVE id or a raw semver string into the rendered output', () => {
    const report = assembleClientReport(
      SITE,
      snapshot(
        payload({ openCves: [{ id: 'CVE-2026-99999', urgency: 'critical', status: 'open' }] }),
      ),
      [
        {
          siteId: SITE.id,
          componentKind: 'plugin',
          componentName: 'seo',
          version: '1.0.0',
          expectedVersion: '1.4.2',
          direction: 'behind',
        },
      ],
    )
    const message = renderClientReport(report)
    const flat = JSON.stringify(message)

    expect(flat).not.toContain('CVE-2026-99999')
    expect(flat).not.toContain('1.0.0')
    expect(flat).not.toContain('1.4.2')
    // Plain-language content must still be present.
    expect(flat).toContain('critique')
  })

  it('renders a real, non-empty title naming the site and at least one key figure', () => {
    const report = assembleClientReport(SITE, snapshot(payload()), [])
    const message = renderClientReport(report)
    expect(message.title).toContain('Boulangerie Dupont')
    expect(message.keyFigures.length).toBeGreaterThan(0)
  })

  it('honestly describes an unavailable field in plain language instead of omitting it or showing a number', () => {
    const report = assembleClientReport(SITE, snapshot(payload()), [])
    const message = renderClientReport(report)
    const availabilitySection = message.sections.find(
      (section) => section.heading === 'Disponibilité',
    )
    expect(availabilitySection?.body).toMatch(/pas encore activé/i)
  })
})
