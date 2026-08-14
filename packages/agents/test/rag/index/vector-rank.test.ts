import { describe, expect, it } from 'vitest'
import type { IndexedChunk } from '../../../src/rag/index/types.js'
import { vectorRank } from '../../../src/rag/index/vector-rank.js'

function indexed(id: string, vector: readonly number[]): IndexedChunk {
  return {
    chunk: { id, documentId: 'doc-1', blockIds: [id], text: id, hash: 'h' },
    siteId: 'site-a',
    vector,
  }
}

describe('vectorRank', () => {
  it('ranks the closest vector first, by cosine similarity', () => {
    const chunks = [indexed('far', [1, 0]), indexed('close', [0.9, 0.1])]

    const ranked = vectorRank(chunks, [1, 0])

    expect(ranked[0]?.id).toBe('far')
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  it('excludes a chunk that is orthogonal to the query (zero or negative similarity)', () => {
    const chunks = [indexed('aligned', [1, 0]), indexed('orthogonal', [0, 1])]

    const ranked = vectorRank(chunks, [1, 0])

    expect(ranked.map((r) => r.id)).toEqual(['aligned'])
  })

  it('treats a zero-magnitude vector as zero similarity rather than dividing by zero', () => {
    const chunks = [indexed('empty', [0, 0])]
    expect(vectorRank(chunks, [1, 0])).toEqual([])
  })
})
