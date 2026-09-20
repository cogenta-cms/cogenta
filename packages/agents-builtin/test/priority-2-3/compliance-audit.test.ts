import { describe, expect, it } from 'vitest'
import { auditCompliance, type ComplianceInput } from '../../src/compliance/audit.js'

const REQUIRED = [
  { label: 'Mentions légales', candidates: ['/mentions-legales', '/legal'] },
  { label: 'Politique de confidentialité', candidates: ['/confidentialite', '/privacy'] },
]

function input(overrides: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    publishedPaths: ['/mentions-legales', '/confidentialite'],
    requiredPages: REQUIRED,
    auditRetentionDays: 365,
    formSubmissionRetentionDays: 180,
    entries: [],
    embeds: [],
    consentRequiredBySetting: true,
    ...overrides,
  }
}

describe('auditing what a site must be able to show', () => {
  it('finds nothing on a site that has its pages, its retentions and no generated content', () => {
    expect(auditCompliance(input())).toEqual([])
  })

  it('names a missing legal page by what it is, not by a slug', () => {
    const findings = auditCompliance(input({ publishedPaths: ['/confidentialite'] }))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ issue: 'missing-legal-page', subject: 'Mentions légales' })
  })

  it('treats an unset retention and an explicit zero the same way', () => {
    const findings = auditCompliance(
      input({ auditRetentionDays: undefined, formSubmissionRetentionDays: 0 }),
    )

    expect(findings.map((finding) => finding.subject)).toEqual(['audit log', 'form submissions'])
  })

  it('accepts generated content that names its agent and its model, and only that', () => {
    const findings = auditCompliance(
      input({
        entries: [
          {
            id: '1',
            title: 'Declared',
            provenance: 'generated',
            provenanceDetail: { agent: 'content', model: 'claude-sonnet' },
          },
          {
            id: '2',
            title: 'Half declared',
            provenance: 'generated',
            provenanceDetail: { agent: 'content' },
          },
          { id: '3', title: 'Written by a person', provenance: 'human', provenanceDetail: null },
        ],
      }),
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ issue: 'provenance-undeclared', subject: 'Half declared' })
  })

  it('only contradicts an embed when the site itself asks for consent', () => {
    const embeds = [{ entryId: '1', provider: 'youtube', consentRequired: false }]

    expect(auditCompliance(input({ embeds }))).toHaveLength(1)
    expect(auditCompliance(input({ embeds, consentRequiredBySetting: false }))).toEqual([])
  })
})
