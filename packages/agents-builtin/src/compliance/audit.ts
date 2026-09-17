/**
 * The obligations a European site carries, checked against what the site
 * really holds (L5 task 10, Conformité).
 *
 * Every finding is a fact about configuration or content, never an opinion:
 * a page exists or it does not, a retention is set or it is not, an entry
 * written by a model names that model or it does not. The agent's own
 * identity is explicit that none of this is legal advice — a checklist is not
 * a lawyer, and saying otherwise would be the worst kind of false confidence.
 */

export type ComplianceIssue =
  | 'missing-legal-page'
  | 'retention-unset'
  | 'provenance-undeclared'
  | 'consent-mismatch'

export interface ComplianceFinding {
  readonly issue: ComplianceIssue
  readonly subject: string
  readonly detail: string
}

export interface ComplianceEntry {
  readonly id: string
  readonly title: string
  readonly provenance: string
  readonly provenanceDetail: Readonly<Record<string, unknown>> | null
}

export interface ComplianceEmbed {
  readonly entryId: string
  readonly provider: string
  readonly consentRequired: boolean
}

export interface ComplianceInput {
  /** Slugs (or paths) of the pages the site publishes right now. */
  readonly publishedPaths: readonly string[]
  /** What a site of this jurisdiction is expected to publish. Passed in, never hardcoded to one country. */
  readonly requiredPages: readonly {
    readonly label: string
    readonly candidates: readonly string[]
  }[]
  readonly auditRetentionDays: number | undefined
  readonly formSubmissionRetentionDays: number | undefined
  readonly entries: readonly ComplianceEntry[]
  readonly embeds: readonly ComplianceEmbed[]
  /** The site setting that says a third-party embed must ask before loading. */
  readonly consentRequiredBySetting: boolean
}

export function auditCompliance(input: ComplianceInput): readonly ComplianceFinding[] {
  const findings: ComplianceFinding[] = []
  const published = new Set(input.publishedPaths.map((path) => path.toLowerCase()))

  for (const page of input.requiredPages) {
    if (page.candidates.some((candidate) => published.has(candidate.toLowerCase()))) continue
    findings.push({
      issue: 'missing-legal-page',
      subject: page.label,
      detail: `No published page answers "${page.label}".`,
    })
  }

  if (input.auditRetentionDays === undefined || input.auditRetentionDays === 0) {
    findings.push({
      issue: 'retention-unset',
      subject: 'audit log',
      detail:
        'No retention is configured, so the audit log grows for ever — including the personal data in it.',
    })
  }
  if (input.formSubmissionRetentionDays === undefined || input.formSubmissionRetentionDays === 0) {
    findings.push({
      issue: 'retention-unset',
      subject: 'form submissions',
      detail: 'No retention is configured: what visitors typed into a form is kept indefinitely.',
    })
  }

  for (const entry of input.entries) {
    if (entry.provenance === 'human') continue
    const detail = entry.provenanceDetail ?? {}
    const names = typeof detail['agent'] === 'string' && detail['agent'] !== ''
    const model = typeof detail['model'] === 'string' && detail['model'] !== ''
    if (names && model) continue
    findings.push({
      issue: 'provenance-undeclared',
      subject: entry.title,
      detail: `Recorded as "${entry.provenance}" without naming ${names ? 'the model' : 'the agent'} that wrote it.`,
    })
  }

  if (input.consentRequiredBySetting) {
    for (const embed of input.embeds) {
      if (embed.consentRequired) continue
      findings.push({
        issue: 'consent-mismatch',
        subject: `${embed.provider} embed`,
        detail:
          'This site asks for consent before third-party content loads, but this block does not.',
      })
    }
  }

  return findings
}
