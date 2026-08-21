import { describe, expect, it } from 'vitest'
import { createHashingEmbeddingProvider } from '../../../src/rag/embeddings/hashing-provider.js'
import {
  ingestReferenceDocument,
  removeReferenceDocumentVectors,
} from '../../../src/rag/reference-documents/ingest.js'
import { REFERENCE_DOCUMENT_COLLECTION } from '../../../src/rag/reference-documents/types.js'
import { createMemoryVectorStore } from '../../../src/rag/vector/memory.js'

const SITE_ID = 'https://example.com'

function embedder(): ReturnType<typeof createHashingEmbeddingProvider> {
  return createHashingEmbeddingProvider({ dimensions: 32 })
}

describe('ingestReferenceDocument', () => {
  it('chunks a multi-paragraph document into more than one chunk, unlike the one-chunk-per-entry content indexer', async () => {
    const store = createMemoryVectorStore({ dimensions: 32 })
    const embeddings = embedder()
    const text = Array.from({ length: 6 }, (_, index) => `Paragraph ${index}. `.repeat(200)).join(
      '\n\n',
    )

    const result = await ingestReferenceDocument({ filename: 'handbook.pdf', text }, 'doc-1', {
      store,
      embeddings,
      siteId: SITE_ID,
    })

    expect(result.chunkCount).toBeGreaterThan(1)
    expect(
      await store.count({ siteId: SITE_ID, collections: [REFERENCE_DOCUMENT_COLLECTION] }),
    ).toBe(result.chunkCount)
  })

  it('stores chunks retrievable by a vector search scoped to the reference-document pseudo-collection', async () => {
    const store = createMemoryVectorStore({ dimensions: 32 })
    const embeddings = embedder()
    await ingestReferenceDocument(
      {
        filename: 'return-policy.md',
        text: 'Returns are accepted within thirty days of purchase.',
      },
      'doc-2',
      { store, embeddings, siteId: SITE_ID },
    )

    const [queryVector] = await embeddings.embed(['What is the return policy?'])
    const matches = await store.search(queryVector ?? [], {
      filter: { siteId: SITE_ID, collections: [REFERENCE_DOCUMENT_COLLECTION] },
    })

    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]?.record.entryId).toBe('doc-2')
    expect(matches[0]?.record.status).toBe('published')
  })

  it('produces nothing for a document with no real text (whitespace only)', async () => {
    const store = createMemoryVectorStore({ dimensions: 32 })
    const embeddings = embedder()

    const result = await ingestReferenceDocument(
      { filename: 'empty.txt', text: '   \n\n   ' },
      'doc-3',
      { store, embeddings, siteId: SITE_ID },
    )

    expect(result.chunkCount).toBe(0)
    expect(await store.count({ siteId: SITE_ID })).toBe(0)
  })

  it('removes every chunk a document produced, and none belonging to another document', async () => {
    const store = createMemoryVectorStore({ dimensions: 32 })
    const embeddings = embedder()
    await ingestReferenceDocument(
      { filename: 'a.md', text: 'First document text.\n\nSecond paragraph of the first document.' },
      'doc-a',
      { store, embeddings, siteId: SITE_ID },
    )
    await ingestReferenceDocument(
      { filename: 'b.md', text: 'Second document, entirely unrelated content.' },
      'doc-b',
      { store, embeddings, siteId: SITE_ID },
    )

    await removeReferenceDocumentVectors(store, SITE_ID, 'doc-a')

    const remaining = await store.search((await embeddings.embed(['unrelated content']))[0] ?? [], {
      filter: { siteId: SITE_ID, collections: [REFERENCE_DOCUMENT_COLLECTION] },
    })
    expect(remaining.length).toBeGreaterThan(0)
    expect(remaining.every((match) => match.record.entryId === 'doc-b')).toBe(true)
  })
})
