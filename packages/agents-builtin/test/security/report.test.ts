import { describe, expect, it } from 'vitest'
import { buildSecurityReport, type SecurityFinding } from '../../src/security/report.js'

function finding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    package: 'lodash',
    version: '4.17.15',
    vulnerability: { id: 'GHSA-xxxx', summary: 'Prototype pollution', aliases: ['CVE-2021-23337'] },
    assessment: { cvss: 7.5, epss: 0.3, urgency: 'high' },
    ...overrides,
  }
}

describe('buildSecurityReport', () => {
  it('produces all five imposed sections for each finding', () => {
    const report = buildSecurityReport([finding()], { now: () => new Date('2026-01-01').getTime() })

    expect(report.entries).toHaveLength(1)
    const entry = report.entries[0]
    expect(entry?.whatIsAffected).toContain('lodash@4.17.15')
    expect(entry?.whatIsAffected).toContain('GHSA-xxxx')
    expect(entry?.whatIsAffected).toContain('CVE-2021-23337')
    expect(entry?.whatAnAttackerCouldDo).toBe('Prototype pollution')
    expect(entry?.isTheSiteExposed).toMatch(/activement exploitée/)
    expect(entry?.whatIsProposed).toContain('lodash')
    expect(entry?.whatHappensIfNothingIsDone).toMatch(/risque/i)
  })

  it('stamps generatedAt from the injected clock', () => {
    const report = buildSecurityReport([], {
      now: () => new Date('2026-01-01T00:00:00.000Z').getTime(),
    })
    expect(report.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('falls back to details when no summary is given', () => {
    const report = buildSecurityReport([
      finding({ vulnerability: { id: 'GHSA-x', details: 'Full detail text' } }),
    ])
    expect(report.entries[0]?.whatAnAttackerCouldDo).toBe('Full detail text')
  })

  it('describes exposure differently across urgency levels', () => {
    const critical = buildSecurityReport([finding({ assessment: { urgency: 'critical' } })])
    const low = buildSecurityReport([finding({ assessment: { urgency: 'low' } })])
    expect(critical.entries[0]?.isTheSiteExposed).not.toBe(low.entries[0]?.isTheSiteExposed)
  })
})
