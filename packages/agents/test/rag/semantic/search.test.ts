import { describe, expect, it } from 'vitest'
import { createHashingEmbeddingProvider } from '../../../src/rag/embeddings/hashing-provider.js'
import { createSemanticSearch, type FullTextSearchLike } from '../../../src/rag/semantic/search.js'
import { createMemoryVectorStore } from '../../../src/rag/vector/memory.js'
import type { VectorRecord, VectorStore } from '../../../src/rag/vector/types.js'

const embeddings = createHashingEmbeddingProvider({ dimensions: 64 })

async function storeWith(
  entries: readonly { readonly id: string; readonly text: string; readonly collection?: string }[],
): Promise<VectorStore> {
  const store = createMemoryVectorStore({ dimensions: embeddings.dimensions })
  const vectors = await embeddings.embed(entries.map((entry) => entry.text))
  const records: VectorRecord[] = entries.map((entry, index) => ({
    siteId: 'site-a',
    collection: entry.collection ?? 'articles',
    entryId: entry.id,
    locale: 'en',
    status: 'published',
    chunk: {
      id: `${entry.id}:0`,
      documentId: entry.id,
      blockIds: [`${entry.id}-b`],
      text: entry.text,
      hash: `h-${entry.id}`,
    },
    vector: vectors[index] ?? [],
  }))
  await store.upsert(records)
  return store
}

function fullTextReturning(
  hits: readonly { readonly id: string; readonly collection: string; readonly title: string }[],
): FullTextSearchLike {
  return {
    search: async () => ({
      hits: hits.map((hit, index) => ({
        ...hit,
        locale: 'en',
        status: 'published',
        score: hits.length - index,
      })),
    }),
  }
}

describe('semantic search', () => {
  it('finds an entry whose wording matches, through the vector half alone', async () => {
    const store = await storeWith([
      { id: 'a', text: 'cathedral architecture in medieval france' },
      { id: 'b', text: 'how to season a cast iron pan' },
    ])
    const search = createSemanticSearch({ store, embeddings })

    const hits = await search.search({
      text: 'medieval france cathedral',
      locale: 'en',
      siteId: 'site-a',
      collections: ['articles'],
    })

    expect(hits[0]?.id).toBe('a')
    expect(hits[0]?.matched).toContain('semantic')
  })

  it('adds the full-text half rather than replacing it', async () => {
    const store = await storeWith([{ id: 'a', text: 'cathedral architecture' }])
    const search = createSemanticSearch({
      store,
      embeddings,
      fullText: fullTextReturning([{ id: 'z', collection: 'articles', title: 'Part number XR-9' }]),
    })

    const hits = await search.search({
      text: 'XR-9',
      locale: 'en',
      siteId: 'site-a',
      collections: ['articles'],
    })

    // The exact-keyword hit the vector half is known to miss is present, which
    // is the entire reason the hybrid exists.
    expect(hits.map((hit) => hit.id)).toContain('z')
    expect(hits.find((hit) => hit.id === 'z')?.matched).toEqual(['full-text'])
  })

  it('ranks an entry both halves agree on above one only a single half found', async () => {
    const store = await storeWith([
      { id: 'both', text: 'romanesque cathedral nave' },
      { id: 'vector-only', text: 'romanesque cathedral crypt' },
    ])
    const search = createSemanticSearch({
      store,
      embeddings,
      fullText: fullTextReturning([
        { id: 'both', collection: 'articles', title: 'Romanesque cathedral nave' },
        { id: 'text-only', collection: 'articles', title: 'Nave' },
      ]),
    })

    const hits = await search.search({
      text: 'romanesque cathedral nave',
      locale: 'en',
      siteId: 'site-a',
      collections: ['articles'],
    })

    expect(hits[0]?.id).toBe('both')
    expect(hits[0]?.matched).toEqual(['semantic', 'full-text'])
  })

  it('lists an entry once even when several of its chunks match', async () => {
    const store = createMemoryVectorStore({ dimensions: embeddings.dimensions })
    const texts = ['cathedral nave and transept', 'cathedral crypt and apse']
    const vectors = await embeddings.embed(texts)
    await store.upsert(
      texts.map((text, index) => ({
        siteId: 'site-a',
        collection: 'articles',
        entryId: 'long-article',
        locale: 'en',
        status: 'published',
        chunk: {
          id: `long-article:${index}`,
          documentId: 'long-article',
          blockIds: [`b${index}`],
          text,
          hash: `h${index}`,
        },
        vector: vectors[index] ?? [],
      })),
    )
    const search = createSemanticSearch({ store, embeddings })

    const hits = await search.search({
      text: 'cathedral',
      locale: 'en',
      siteId: 'site-a',
      collections: ['articles'],
    })

    expect(hits.filter((hit) => hit.id === 'long-article')).toHaveLength(1)
  })

  it('never reaches a collection the caller did not put in scope', async () => {
    const store = await storeWith([
      { id: 'public-one', text: 'cathedral architecture' },
      { id: 'secret-one', text: 'cathedral architecture', collection: 'internal-notes' },
    ])
    const search = createSemanticSearch({ store, embeddings })

    const hits = await search.search({
      text: 'cathedral architecture',
      locale: 'en',
      siteId: 'site-a',
      collections: ['articles'],
    })

    expect(hits.map((hit) => hit.id)).toEqual(['public-one'])
  })

  it('answers with nothing at all when the actor may read no collection', async () => {
    const store = await storeWith([{ id: 'a', text: 'cathedral architecture' }])
    const search = createSemanticSearch({ store, embeddings })

    expect(
      await search.search({ text: 'cathedral', locale: 'en', siteId: 'site-a', collections: [] }),
    ).toEqual([])
  })

  it('carries the matching chunk so a caller can cite it', async () => {
    const store = await storeWith([{ id: 'a', text: 'the nave is forty metres long' }])
    const search = createSemanticSearch({ store, embeddings })

    const hits = await search.search({
      text: 'how long is the nave',
      locale: 'en',
      siteId: 'site-a',
      collections: ['articles'],
    })

    expect(hits[0]?.excerpt).toBe('the nave is forty metres long')
  })
})
