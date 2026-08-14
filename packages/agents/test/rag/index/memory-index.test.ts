import { describe, expect, it } from 'vitest'
import { createMemoryRagIndex } from '../../../src/rag/index/memory-index.js'
import type { IndexedChunk } from '../../../src/rag/index/types.js'

function indexed(
  id: string,
  text: string,
  vector: readonly number[],
  siteId = 'site-a',
): IndexedChunk {
  return { chunk: { id, documentId: 'doc-1', blockIds: [id], text, hash: 'h' }, siteId, vector }
}

const ALLOW_ALL = () => true

describe('createMemoryRagIndex', () => {
  it('finds a chunk by keyword and returns it in the results', () => {
    const index = createMemoryRagIndex()
    index.upsert(indexed('a', 'a guide to triaging a CVE in your dependencies', [1, 0]))

    const results = index.search(
      { text: 'CVE dependencies', vector: [1, 0] },
      { canAccess: ALLOW_ALL },
    )

    expect(results.map((r) => r.chunk.id)).toContain('a')
  })

  it('finds a chunk by vector similarity even with no keyword overlap', () => {
    const index = createMemoryRagIndex()
    index.upsert(indexed('a', 'completely different words entirely', [1, 0]))

    const results = index.search({ text: 'zzz nomatch', vector: [1, 0] }, { canAccess: ALLOW_ALL })

    expect(results.map((r) => r.chunk.id)).toContain('a')
  })

  it('caps results at the given limit', () => {
    const index = createMemoryRagIndex()
    for (const id of ['a', 'b', 'c']) index.upsert(indexed(id, 'triage guide', [1, 0]))

    const results = index.search(
      { text: 'triage', vector: [1, 0] },
      { canAccess: ALLOW_ALL, limit: 2 },
    )

    expect(results).toHaveLength(2)
  })

  it('remove takes a chunk out of the index entirely', () => {
    const index = createMemoryRagIndex()
    index.upsert(indexed('a', 'triage guide', [1, 0]))
    index.remove('a')

    const results = index.search({ text: 'triage', vector: [1, 0] }, { canAccess: ALLOW_ALL })

    expect(results).toEqual([])
  })

  it('upsert replaces a chunk with the same id rather than duplicating it', () => {
    const index = createMemoryRagIndex()
    index.upsert(indexed('a', 'old text', [1, 0]))
    index.upsert(indexed('a', 'new text', [1, 0]))

    const results = index.search({ text: 'new', vector: [1, 0] }, { canAccess: ALLOW_ALL })

    expect(results).toHaveLength(1)
    expect(results[0]?.chunk.text).toBe('new text')
  })
})
