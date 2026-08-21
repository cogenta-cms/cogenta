/**
 * Splits a Changesets-generated `CHANGELOG.md` into per-version sections, and
 * flags the ones that look like they touch a frozen contract (A/B/C/D/E) —
 * a **heuristic keyword scan of prose**, not a structured signal, and it says
 * so everywhere it is surfaced. See `contract-risk.ts`'s module comment for
 * the honest limits of what this can actually detect.
 */

export interface ChangelogSection {
  readonly version: string
  readonly body: string
}

/** `## 0.5.0` — Changesets' own heading format (`@changesets/changelog-github` and the default changelog both use it). */
const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/u

export function splitChangelogSections(markdown: string): readonly ChangelogSection[] {
  const lines = markdown.split(/\r\n|\r|\n/u)
  const sections: ChangelogSection[] = []
  let current: { version: string; lines: string[] } | null = null

  for (const line of lines) {
    const match = VERSION_HEADING.exec(line)
    if (match?.[1] !== undefined) {
      if (current !== null)
        sections.push({ version: current.version, body: current.lines.join('\n').trim() })
      current = { version: match[1], lines: [] }
      continue
    }
    if (current !== null) current.lines.push(line)
  }
  if (current !== null)
    sections.push({ version: current.version, body: current.lines.join('\n').trim() })

  return sections
}

/**
 * Deliberately broad rather than precise: this is a warning, not a
 * certification, and a missed keyword is worse than a false positive here
 * (a human reviews every flagged version before an update is applied). Covers
 * both languages this codebase's own changesets are written in (English,
 * per AGENTS.md) and the French vocabulary this project's own design docs
 * use for the same idea, in case a changeset note quotes one.
 */
const FROZEN_CONTRACT_PATTERN =
  /\bcontract\s+[a-e]\b|\bcontrat\s+[a-e]\b|schema@\d|tools@\d|blocks?@\d|theme@\d|breaking change|changement cassant|frozen contract|contrat\s+fig[eé]|\badr-\d{4}\b/iu

export interface ContractRiskWarning {
  readonly version: string
  /** The matched section's own text, trimmed to a readable excerpt — never invented, always a substring of the real changelog. */
  readonly excerpt: string
}

/** The versions in `sections` whose body matches `FROZEN_CONTRACT_PATTERN`. */
export function sectionsMentioningContractRisk(
  sections: readonly ChangelogSection[],
): readonly ContractRiskWarning[] {
  const warnings: ContractRiskWarning[] = []
  for (const section of sections) {
    if (!FROZEN_CONTRACT_PATTERN.test(section.body)) continue
    warnings.push({ version: section.version, excerpt: excerptOf(section.body) })
  }
  return warnings
}

const MAX_EXCERPT_LENGTH = 400

function excerptOf(body: string): string {
  const collapsed = body.replace(/\s+/gu, ' ').trim()
  return collapsed.length > MAX_EXCERPT_LENGTH
    ? `${collapsed.slice(0, MAX_EXCERPT_LENGTH)}…`
    : collapsed
}
