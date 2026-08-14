import { describe, expect, it } from 'vitest'
import { reciprocalRankFusion } from '../../../src/rag/index/rrf.js'

describe('reciprocalRankFusion', () => {
  it('ranks a document appearing near the top of both lists above one appearing in only one', () => {
    const bm25 = [
      { id: 'a', score: 9 },
      { id: 'b', score: 1 },
    ]
    const vector = [
      { id: 'a', score: 0.9 },
      { id: 'c', score: 0.1 },
    ]

    const fused = reciprocalRankFusion([bm25, vector])

    expect(fused[0]?.id).toBe('a')
  })

  it('gives a document present in every list a higher score than one present in only one', () => {
    const listA = [
      { id: 'both', score: 1 },
      { id: 'onlyA', score: 0.5 },
    ]
    const listB = [
      { id: 'both', score: 1 },
      { id: 'onlyB', score: 0.5 },
    ]

    const fused = reciprocalRankFusion([listA, listB])
    const both = fused.find((r) => r.id === 'both')
    const onlyA = fused.find((r) => r.id === 'onlyA')

    expect(both?.score).toBeGreaterThan(onlyA?.score ?? 0)
  })

  it('is not affected by the raw score values, only by rank position', () => {
    const listA = [
      { id: 'a', score: 1_000_000 },
      { id: 'b', score: 0.0001 },
    ]

    const fused = reciprocalRankFusion([listA])

    expect(fused.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('returns an empty list when given no rankings', () => {
    expect(reciprocalRankFusion([])).toEqual([])
  })
})
