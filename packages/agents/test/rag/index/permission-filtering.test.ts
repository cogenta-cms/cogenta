import { describe, expect, it } from 'vitest'
import { createMemoryRagIndex } from '../../../src/rag/index/memory-index.js'
import type { IndexedChunk } from '../../../src/rag/index/types.js'

/**
 * The lot's own acceptance criterion, verbatim: "Filtrage de permissions au
 * moment de la requête — non négociable. Un test dédié vérifie qu'aucun
 * brouillon, contenu privé ou contenu d'un autre site ne peut remonter."
 * Every chunk below is constructed to score *highest* on both BM25 and the
 * vector — the query text and vector are copied straight from the
 * would-be-leaked chunks — so this only passes if the permission filter is
 * genuinely applied before ranking, not merely a plausible top result.
 */
interface Visibility {
  readonly siteId: string
  readonly status: 'draft' | 'published'
  readonly private: boolean
}

function chunkWithVisibility(
  id: string,
  visibility: Visibility,
): IndexedChunk & { readonly visibility: Visibility } {
  return {
    chunk: {
      id,
      documentId: id,
      blockIds: [id],
      text: 'confidential quarterly revenue figures for acme corp',
      hash: 'h',
    },
    siteId: visibility.siteId,
    vector: [1, 0, 0],
    visibility,
  }
}

const QUERY = {
  text: 'confidential quarterly revenue figures for acme corp',
  vector: [1, 0, 0],
}

describe('RAG hybrid search — permission filtering', () => {
  it('never returns a draft, no matter how well it scores', () => {
    const index = createMemoryRagIndex()
    const draft = chunkWithVisibility('draft-1', {
      siteId: 'site-a',
      status: 'draft',
      private: false,
    })
    const published = chunkWithVisibility('published-1', {
      siteId: 'site-a',
      status: 'published',
      private: false,
    })
    index.upsert(draft)
    index.upsert(published)

    const results = index.search(QUERY, {
      canAccess: (indexed) => (indexed as typeof draft).visibility.status === 'published',
    })

    expect(results.map((r) => r.chunk.id)).not.toContain('draft-1')
    expect(results.map((r) => r.chunk.id)).toContain('published-1')
  })

  it('never returns private content', () => {
    const index = createMemoryRagIndex()
    const privateChunk = chunkWithVisibility('private-1', {
      siteId: 'site-a',
      status: 'published',
      private: true,
    })
    const publicChunk = chunkWithVisibility('public-1', {
      siteId: 'site-a',
      status: 'published',
      private: false,
    })
    index.upsert(privateChunk)
    index.upsert(publicChunk)

    const results = index.search(QUERY, {
      canAccess: (indexed) => !(indexed as typeof privateChunk).visibility.private,
    })

    expect(results.map((r) => r.chunk.id)).not.toContain('private-1')
    expect(results.map((r) => r.chunk.id)).toContain('public-1')
  })

  it('never returns content from another site', () => {
    const index = createMemoryRagIndex()
    const otherSite = chunkWithVisibility('other-site-1', {
      siteId: 'site-b',
      status: 'published',
      private: false,
    })
    const ownSite = chunkWithVisibility('own-site-1', {
      siteId: 'site-a',
      status: 'published',
      private: false,
    })
    index.upsert(otherSite)
    index.upsert(ownSite)

    const results = index.search(QUERY, { canAccess: (indexed) => indexed.siteId === 'site-a' })

    expect(results.map((r) => r.chunk.id)).not.toContain('other-site-1')
    expect(results.map((r) => r.chunk.id)).toContain('own-site-1')
  })

  it('a rejected chunk cannot leak even when it is the only chunk in the index', () => {
    const index = createMemoryRagIndex()
    index.upsert(
      chunkWithVisibility('draft-only', { siteId: 'site-a', status: 'draft', private: false }),
    )

    const results = index.search(QUERY, {
      canAccess: (indexed) =>
        (indexed as ReturnType<typeof chunkWithVisibility>).visibility.status === 'published',
    })

    expect(results).toEqual([])
  })

  it('combines all three checks — only content that is published, non-private, and same-site can ever return', () => {
    const index = createMemoryRagIndex()
    const bad = [
      chunkWithVisibility('draft', { siteId: 'site-a', status: 'draft', private: false }),
      chunkWithVisibility('private', { siteId: 'site-a', status: 'published', private: true }),
      chunkWithVisibility('other-site', { siteId: 'site-b', status: 'published', private: false }),
    ]
    const good = chunkWithVisibility('allowed', {
      siteId: 'site-a',
      status: 'published',
      private: false,
    })
    for (const chunk of [...bad, good]) index.upsert(chunk)

    const results = index.search(QUERY, {
      canAccess: (indexed) => {
        const visibility = (indexed as typeof good).visibility
        return (
          visibility.siteId === 'site-a' && visibility.status === 'published' && !visibility.private
        )
      },
    })

    expect(results.map((r) => r.chunk.id)).toEqual(['allowed'])
  })
})
