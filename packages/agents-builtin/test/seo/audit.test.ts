import { describe, expect, it } from 'vitest'
import { auditSeoPage } from '../../src/seo/audit.js'
import type { SeoPageInput } from '../../src/seo/types.js'

function cleanPage(overrides: Partial<SeoPageInput> = {}): SeoPageInput {
  return {
    url: '/blog/cve-triage-guide',
    title: 'A Practical Guide to Triaging CVEs',
    metaDescription:
      'Learn how to triage CVEs affecting your dependencies using OSV and EPSS, so you spend effort on what actually matters.',
    canonicalUrl: 'https://example.com/blog/cve-triage-guide',
    headings: [
      { level: 1, text: 'A Practical Guide to Triaging CVEs' },
      { level: 2, text: 'Why triage matters' },
      { level: 2, text: 'Using OSV and EPSS' },
    ],
    images: [{ alt: 'A dependency graph highlighting a vulnerable package' }],
    internalLinks: ['/blog/deps-scan-tool', '/docs/security'],
    bodyText: 'The cat sat on the mat. '.repeat(60),
    ...overrides,
  }
}

function withoutMetaDescription(page: SeoPageInput): SeoPageInput {
  const { metaDescription: _metaDescription, ...rest } = page
  return rest as SeoPageInput
}

function withoutCanonical(page: SeoPageInput): SeoPageInput {
  const { canonicalUrl: _canonicalUrl, ...rest } = page
  return rest as SeoPageInput
}

describe('auditSeoPage', () => {
  it('finds nothing on a well-formed page — no false positives', () => {
    const result = auditSeoPage(cleanPage())
    expect(result.findings).toEqual([])
  })

  it('errors when there is no title', () => {
    const result = auditSeoPage(cleanPage({ title: '' }))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'title', severity: 'error' }),
    )
  })

  it('warns when the title is too short or too long', () => {
    expect(auditSeoPage(cleanPage({ title: 'Short' })).findings).toContainEqual(
      expect.objectContaining({ check: 'title', severity: 'warning' }),
    )
    expect(auditSeoPage(cleanPage({ title: 'A'.repeat(100) })).findings).toContainEqual(
      expect.objectContaining({ check: 'title', severity: 'warning' }),
    )
  })

  it('warns when there is no meta description', () => {
    const result = auditSeoPage(withoutMetaDescription(cleanPage()))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'meta_description', severity: 'warning' }),
    )
  })

  it('errors when there is no H1', () => {
    const result = auditSeoPage(cleanPage({ headings: [{ level: 2, text: 'Intro' }] }))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'heading_structure', severity: 'error' }),
    )
  })

  it('warns on multiple H1s', () => {
    const result = auditSeoPage(
      cleanPage({
        headings: [
          { level: 1, text: 'First' },
          { level: 1, text: 'Second' },
        ],
      }),
    )
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'heading_structure', severity: 'warning' }),
    )
  })

  it('warns when a heading level is skipped', () => {
    const result = auditSeoPage(
      cleanPage({
        headings: [
          { level: 1, text: 'Title' },
          { level: 3, text: 'Skipped to H3' },
        ],
      }),
    )
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'heading_structure', severity: 'warning' }),
    )
  })

  it('errors when a non-decorative image is missing alt text', () => {
    const result = auditSeoPage(cleanPage({ images: [{ alt: null }] }))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'alt_text', severity: 'error' }),
    )
  })

  it('does not flag a decorative image with no alt text', () => {
    const result = auditSeoPage(cleanPage({ images: [{ alt: null, decorative: true }] }))
    expect(result.findings.some((f) => f.check === 'alt_text')).toBe(false)
  })

  it('warns when there are no internal links', () => {
    const result = auditSeoPage(cleanPage({ internalLinks: [] }))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'internal_linking', severity: 'warning' }),
    )
  })

  it('warns when there is no canonical URL', () => {
    const result = auditSeoPage(withoutCanonical(cleanPage()))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'canonical', severity: 'warning' }),
    )
  })

  it('warns when the body is thin', () => {
    const result = auditSeoPage(cleanPage({ bodyText: 'Too short.' }))
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'length', severity: 'warning' }),
    )
  })

  it('flags hard-to-read text as info, not a blocking severity', () => {
    const hardToRead = cleanPage({
      bodyText:
        'The extraordinarily sophisticated methodology employed in this comprehensive investigation necessitates thorough elucidation of its multifaceted theoretical underpinnings and epistemological ramifications. '.repeat(
          20,
        ),
    })
    const result = auditSeoPage(hardToRead)
    expect(result.findings).toContainEqual(
      expect.objectContaining({ check: 'readability', severity: 'info' }),
    )
  })

  it('carries the page URL through to the result', () => {
    expect(auditSeoPage(cleanPage()).url).toBe('/blog/cve-triage-guide')
  })
})
