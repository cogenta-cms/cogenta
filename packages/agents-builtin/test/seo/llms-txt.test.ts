import { describe, expect, it } from 'vitest'
import { validateLlmsTxt } from '../../src/seo/llms-txt.js'

describe('validateLlmsTxt', () => {
  it('finds nothing wrong with a well-formed file', () => {
    const content = [
      '# Acme Blog',
      '',
      '> A blog about dependency security and SEO for AI answer engines.',
      '',
      '## Docs',
      '',
      '- [Security guide](https://example.com/security): triaging CVEs.',
      '- [SEO guide](https://example.com/seo): on-page audits.',
      '',
    ].join('\n')

    expect(validateLlmsTxt(content)).toEqual([])
  })

  it('errors when the file does not start with an H1', () => {
    const findings = validateLlmsTxt('Some text\n\n## Docs\n')
    expect(findings).toEqual([expect.objectContaining({ check: 'llms_txt', severity: 'error' })])
  })

  it('ignores leading blank lines before the H1', () => {
    const findings = validateLlmsTxt('\n\n# Title\n\n## Docs\n\n- [x](https://example.com)\n')
    expect(findings).toEqual([])
  })

  it('warns when there are no H2 sections', () => {
    const findings = validateLlmsTxt('# Title\n\nSome prose with a [link](https://example.com).\n')
    expect(findings).toContainEqual(
      expect.objectContaining({ check: 'llms_txt', severity: 'warning' }),
    )
  })

  it('warns when there are no markdown links', () => {
    const findings = validateLlmsTxt('# Title\n\n## Docs\n\nJust prose, no links.\n')
    expect(findings).toContainEqual(
      expect.objectContaining({ check: 'llms_txt', severity: 'warning' }),
    )
  })
})
