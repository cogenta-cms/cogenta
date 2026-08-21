import { describe, expect, it } from 'vitest'
import {
  sectionsMentioningContractRisk,
  splitChangelogSections,
} from '../../src/update/changelog-risk.js'

const CHANGELOG = `# @cogenta/core

## 0.5.0

### Minor Changes

- Contract A moves to schema@2.2 (ADR-0027). Additive, but review before applying.

## 0.4.1

### Patch Changes

- Fixed a small memory leak in the search index.

## 0.4.0

### Minor Changes

- Self-hosted analytics. Nothing here touches a frozen contract.
`

describe('splitChangelogSections', () => {
  it('splits on every "## x.y.z" heading', () => {
    const sections = splitChangelogSections(CHANGELOG)
    expect(sections.map((section) => section.version)).toEqual(['0.5.0', '0.4.1', '0.4.0'])
  })

  it('keeps each section body verbatim, trimmed', () => {
    const sections = splitChangelogSections(CHANGELOG)
    expect(sections[1]?.body).toContain('Fixed a small memory leak')
    expect(sections[1]?.body.startsWith('###')).toBe(true)
  })

  it('returns nothing for text with no version heading', () => {
    expect(splitChangelogSections('# Just a title\n\nSome prose.')).toEqual([])
  })
})

describe('sectionsMentioningContractRisk', () => {
  it('flags a section that names a contract letter', () => {
    const sections = splitChangelogSections(CHANGELOG)
    const warnings = sectionsMentioningContractRisk(sections)
    const bySemver = warnings.find((warning) => warning.version === '0.5.0')
    expect(bySemver?.excerpt).toContain('Contract A')
  })

  it('never flags a section with no matching keyword at all', () => {
    const sections = splitChangelogSections(CHANGELOG)
    const warnings = sectionsMentioningContractRisk(sections)
    expect(warnings.some((warning) => warning.version === '0.4.1')).toBe(false)
  })

  it('is a keyword scan, not comprehension — flags a denial that still contains the keyword', () => {
    const sections = splitChangelogSections(CHANGELOG)
    const warning = sectionsMentioningContractRisk(sections).find((w) => w.version === '0.4.0')
    // The 0.4.0 note literally says "Nothing here touches a frozen
    // contract" — and still matches, because this scan is deliberately
    // broad prose-matching, never actual comprehension. This is the
    // documented false-positive the module comment warns about, proven
    // rather than asserted.
    expect(warning).toBeDefined()
  })

  it('flags nothing when no section mentions any of the keywords', () => {
    const sections = splitChangelogSections('## 1.0.0\n\nJust a bug fix, nothing structural.')
    expect(sectionsMentioningContractRisk(sections)).toEqual([])
  })
})
