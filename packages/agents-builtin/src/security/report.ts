import type { ExploitabilityAssessment, Urgency } from './exploitability.js'
import type { OsvVulnerability } from './osv-client.js'

export interface SecurityFinding {
  readonly package: string
  readonly version: string
  readonly vulnerability: OsvVulnerability
  readonly assessment: ExploitabilityAssessment
}

/** "Le rapport suit un format imposé... Aucun jargon brut." Five plain-language sections, always in this order. */
export interface SecurityReportEntry {
  readonly finding: SecurityFinding
  readonly whatIsAffected: string
  readonly whatAnAttackerCouldDo: string
  readonly isTheSiteExposed: string
  readonly whatIsProposed: string
  readonly whatHappensIfNothingIsDone: string
}

export interface SecurityReport {
  readonly entries: readonly SecurityReportEntry[]
  readonly generatedAt: string
}

function describeExposure(urgency: Urgency): string {
  switch (urgency) {
    case 'critical':
    case 'high':
      return 'Oui — la version installée est concernée, et cette vulnérabilité est activement exploitée dans la nature.'
    case 'medium':
      return 'Probablement — la version installée est concernée ; aucune exploitation active connue à ce jour.'
    default:
      return 'Faible — la version installée est techniquement concernée, mais le risque réel observé est limité.'
  }
}

function describeInaction(urgency: Urgency): string {
  switch (urgency) {
    case 'critical':
      return 'Le site reste exposé à une vulnérabilité activement exploitée — à traiter immédiatement.'
    case 'high':
      return 'Le risque d’exploitation reste élevé tant que la mise à jour n’est pas appliquée.'
    case 'medium':
      return 'Le risque reste modéré ; une mise à jour lors du prochain cycle de maintenance est raisonnable.'
    default:
      return 'Le risque immédiat est faible ; pas d’urgence particulière à agir.'
  }
}

export function buildSecurityReport(
  findings: readonly SecurityFinding[],
  options?: { readonly now?: () => number },
): SecurityReport {
  const now = options?.now ?? Date.now

  const entries = findings.map((finding): SecurityReportEntry => {
    const aliases =
      finding.vulnerability.aliases !== undefined && finding.vulnerability.aliases.length > 0
        ? ` (alias ${finding.vulnerability.aliases.join(', ')})`
        : ''
    return {
      finding,
      whatIsAffected: `${finding.package}@${finding.version} — ${finding.vulnerability.id}${aliases}.`,
      whatAnAttackerCouldDo:
        finding.vulnerability.summary ??
        finding.vulnerability.details ??
        'Le détail n’est pas fourni par la source ; se référer à l’avis de sécurité pour l’impact exact.',
      isTheSiteExposed: describeExposure(finding.assessment.urgency),
      whatIsProposed: `Mettre à jour ${finding.package} au-delà de la version affectée.`,
      whatHappensIfNothingIsDone: describeInaction(finding.assessment.urgency),
    }
  })

  return { entries, generatedAt: new Date(now()).toISOString() }
}
