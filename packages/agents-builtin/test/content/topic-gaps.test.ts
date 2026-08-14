import { describe, expect, it } from 'vitest'
import { suggestTopicGaps } from '../../src/content/topic-gaps.js'

describe('suggestTopicGaps', () => {
  it('flags a candidate topic with no similar existing content as a gap', async () => {
    const gaps = await suggestTopicGaps(
      [
        {
          topic: 'Baking',
          description: 'Baking sourdough bread wild yeast fermentation Dutch oven crust',
        },
      ],
      [
        {
          title: 'CVE triage',
          bodyText: 'Triaging exploited vulnerabilities dependency correlation database software',
        },
      ],
    )
    expect(gaps.map((g) => g.topic)).toEqual(['Baking'])
  })

  it('does not flag a candidate topic already well covered', async () => {
    const text = 'A guide to triaging security vulnerabilities using OSV and EPSS'
    const gaps = await suggestTopicGaps(
      [{ topic: 'CVE triage', description: text }],
      [{ title: 'CVE triage', bodyText: text }],
    )
    expect(gaps).toEqual([])
  })

  it('treats every candidate as a gap when there is no existing content', async () => {
    const gaps = await suggestTopicGaps(
      [
        { topic: 'A', description: 'topic a' },
        { topic: 'B', description: 'topic b' },
      ],
      [],
    )
    expect(gaps.map((g) => g.topic).sort()).toEqual(['A', 'B'])
  })

  it('returns nothing for no candidates', async () => {
    expect(await suggestTopicGaps([], [{ title: 'x', bodyText: 'existing' }])).toEqual([])
  })

  it('caps the number of suggestions', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      topic: `Topic ${i}`,
      description: `unrelated subject number ${i}`,
    }))
    const gaps = await suggestTopicGaps(candidates, [], { maxSuggestions: 3 })
    expect(gaps).toHaveLength(3)
  })

  it('honours a custom similarity threshold', async () => {
    const existing = [{ title: 'x', bodyText: 'security vulnerability response guide' }]
    const candidate = [{ topic: 'y', description: 'security vulnerability triage guide' }]

    const strict = await suggestTopicGaps(candidate, existing, { similarityThreshold: 0.99 })
    expect(strict).toHaveLength(1)

    const loose = await suggestTopicGaps(candidate, existing, { similarityThreshold: 0 })
    expect(loose).toHaveLength(0)
  })

  it('sorts suggestions by lowest similarity first', async () => {
    const gaps = await suggestTopicGaps(
      [
        { topic: 'A', description: 'completely unrelated aardvark husbandry' },
        { topic: 'B', description: 'a slight variation on triaging security vulnerabilities' },
      ],
      [{ title: 'x', bodyText: 'triaging security vulnerabilities in dependencies' }],
      { similarityThreshold: 1 },
    )
    expect(gaps[0]?.topic).toBe('A')
  })
})
