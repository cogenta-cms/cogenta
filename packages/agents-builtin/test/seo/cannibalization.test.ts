import { describe, expect, it } from 'vitest'
import { detectCannibalization } from '../../src/seo/cannibalization.js'

const SAME_TOPIC_A =
  'This guide explains how to triage a CVE affecting your dependencies using OSV and EPSS scoring.'
const SAME_TOPIC_B =
  'This guide explains how to triage a CVE affecting your dependencies using OSV and EPSS scoring, in detail.'
const UNRELATED =
  'Our quarterly bakery revenue exceeded expectations thanks to a new sourdough recipe.'

describe('detectCannibalization', () => {
  it('flags two near-duplicate pages as a cannibalization pair', async () => {
    const pairs = await detectCannibalization([
      { url: '/blog/cve-triage-1', bodyText: SAME_TOPIC_A },
      { url: '/blog/cve-triage-2', bodyText: SAME_TOPIC_B },
    ])

    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ urlA: '/blog/cve-triage-1', urlB: '/blog/cve-triage-2' })
  })

  it('does not flag two unrelated pages', async () => {
    const pairs = await detectCannibalization([
      { url: '/blog/cve-triage', bodyText: SAME_TOPIC_A },
      { url: '/blog/bakery', bodyText: UNRELATED },
    ])
    expect(pairs).toEqual([])
  })

  it('returns an empty list for fewer than two pages', async () => {
    expect(await detectCannibalization([])).toEqual([])
    expect(await detectCannibalization([{ url: '/a', bodyText: SAME_TOPIC_A }])).toEqual([])
  })

  it('respects a custom threshold', async () => {
    const pairs = await detectCannibalization(
      [
        { url: '/blog/cve-triage-1', bodyText: SAME_TOPIC_A },
        { url: '/blog/bakery', bodyText: UNRELATED },
      ],
      { threshold: 1.1 },
    )
    expect(pairs).toEqual([])
  })

  it('sorts pairs by descending similarity', async () => {
    const pairs = await detectCannibalization(
      [
        { url: '/a', bodyText: SAME_TOPIC_A },
        { url: '/b', bodyText: SAME_TOPIC_B },
        { url: '/c', bodyText: SAME_TOPIC_A },
      ],
      { threshold: 0.5 },
    )
    for (let i = 1; i < pairs.length; i++) {
      const previous = pairs[i - 1]
      const current = pairs[i]
      if (previous !== undefined && current !== undefined) {
        expect(previous.score).toBeGreaterThanOrEqual(current.score)
      }
    }
  })
})
