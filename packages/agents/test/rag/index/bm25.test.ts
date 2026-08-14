import { describe, expect, it } from 'vitest'
import { bm25Rank } from '../../../src/rag/index/bm25.js'
import type { IndexedChunk } from '../../../src/rag/index/types.js'

function indexed(id: string, text: string): IndexedChunk {
  return {
    chunk: { id, documentId: 'doc-1', blockIds: [id], text, hash: 'h' },
    siteId: 'site-a',
    vector: [],
  }
}

describe('bm25Rank', () => {
  it('ranks the chunk with more query-term matches higher', () => {
    const chunks = [
      indexed('a', 'the quick brown fox jumps over the lazy dog'),
      indexed('b', 'a completely unrelated sentence about revenue'),
    ]

    const ranked = bm25Rank(chunks, 'quick fox')

    expect(ranked[0]?.id).toBe('a')
  })

  it('returns nothing when the query has no tokens', () => {
    const chunks = [indexed('a', 'some text')]
    expect(bm25Rank(chunks, '   ')).toEqual([])
  })

  it('returns nothing when there are no chunks', () => {
    expect(bm25Rank([], 'query')).toEqual([])
  })

  it('excludes a chunk that matches none of the query terms', () => {
    const chunks = [indexed('a', 'apples and oranges'), indexed('b', 'quarterly revenue report')]

    const ranked = bm25Rank(chunks, 'revenue')

    expect(ranked.map((r) => r.id)).toEqual(['b'])
  })
})
