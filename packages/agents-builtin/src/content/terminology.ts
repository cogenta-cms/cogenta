import type { ContentFinding } from './types.js'

export interface TerminologyRule {
  readonly banned: string
  readonly preferred: string
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * "Cohérence terminologique." Whole-word, case-insensitive matching — a
 * banned term is only ever a real word occurrence, not a substring of an
 * unrelated word ("AI" never matches inside "container").
 */
export function checkTerminology(
  text: string,
  rules: readonly TerminologyRule[],
): readonly ContentFinding[] {
  const findings: ContentFinding[] = []

  for (const rule of rules) {
    const pattern = new RegExp(`\\b${escapeRegExp(rule.banned)}\\b`, 'gi')
    const matches = text.match(pattern)
    if (matches === null || matches.length === 0) continue
    findings.push({
      check: 'terminology',
      severity: 'info',
      message: `"${rule.banned}" used ${matches.length} time(s) — preferred term is "${rule.preferred}".`,
    })
  }

  return findings
}
