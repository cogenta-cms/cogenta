import { describe, expect, it } from 'vitest'
import { proposeInternalLinks } from '../../src/seo/internal-linking.js'

const CVE_TRIAGE_BODY =
  'This guide explains how to triage a CVE affecting your dependencies using OSV and EPSS scoring to prioritise real exploitation risk.'
const DEPS_SCAN_BODY =
  'The deps.scan tool queries OSV for vulnerabilities affecting your installed dependency versions and cross-references EPSS exploitation probability.'
const UNRELATED_BODY =
  'Our quarterly bakery revenue exceeded expectations thanks to a new sourdough recipe.'

describe('proposeInternalLinks', () => {
  it('ranks a topically similar page above an unrelated one', async () => {
    const proposals = await proposeInternalLinks(
      { url: '/blog/cve-triage', bodyText: CVE_TRIAGE_BODY, internalLinks: [] },
      [
        { url: '/blog/deps-scan-tool', bodyText: DEPS_SCAN_BODY },
        { url: '/blog/bakery-revenue', bodyText: UNRELATED_BODY },
      ],
    )

    expect(proposals[0]?.url).toBe('/blog/deps-scan-tool')
  })

  it('never proposes the current page itself', async () => {
    const proposals = await proposeInternalLinks(
      { url: '/blog/cve-triage', bodyText: CVE_TRIAGE_BODY, internalLinks: [] },
      [{ url: '/blog/cve-triage', bodyText: CVE_TRIAGE_BODY }],
    )
    expect(proposals).toEqual([])
  })

  it('never proposes a page already linked', async () => {
    const proposals = await proposeInternalLinks(
      {
        url: '/blog/cve-triage',
        bodyText: CVE_TRIAGE_BODY,
        internalLinks: ['/blog/deps-scan-tool'],
      },
      [{ url: '/blog/deps-scan-tool', bodyText: DEPS_SCAN_BODY }],
    )
    expect(proposals).toEqual([])
  })

  it('excludes a candidate below minScore', async () => {
    const proposals = await proposeInternalLinks(
      { url: '/blog/cve-triage', bodyText: CVE_TRIAGE_BODY, internalLinks: [] },
      [{ url: '/blog/bakery-revenue', bodyText: UNRELATED_BODY }],
      { minScore: 0.9 },
    )
    expect(proposals).toEqual([])
  })

  it('caps results at the given limit', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      url: `/blog/deps-scan-tool-${i}`,
      bodyText: DEPS_SCAN_BODY,
    }))
    const proposals = await proposeInternalLinks(
      { url: '/blog/cve-triage', bodyText: CVE_TRIAGE_BODY, internalLinks: [] },
      candidates,
      { limit: 3 },
    )
    expect(proposals).toHaveLength(3)
  })

  it('returns an empty list when there are no eligible candidates', async () => {
    const proposals = await proposeInternalLinks(
      { url: '/blog/cve-triage', bodyText: CVE_TRIAGE_BODY, internalLinks: [] },
      [],
    )
    expect(proposals).toEqual([])
  })
})
