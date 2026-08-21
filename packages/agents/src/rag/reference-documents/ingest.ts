import type { ExtractedDocument } from '../../documents/extract-text.js'
import { chunkDocument } from '../chunking/chunk-document.js'
import type { ChunkableBlock } from '../chunking/types.js'
import type { EmbeddingProvider } from '../embeddings/types.js'
import type { VectorRecord, VectorStore } from '../vector/types.js'
import {
  REFERENCE_DOCUMENT_COLLECTION,
  REFERENCE_DOCUMENT_LOCALE,
  REFERENCE_DOCUMENT_STATUS,
} from './types.js'

/**
 * The one real user of `chunkDocument` (L18 task 15) against an actual
 * multi-chunk document — `withVectorIndexing`'s own `recordFor` deliberately
 * uses one chunk per entry instead (see that file's comment: real chunking
 * "is a piece of work of its own"). A reference document has no blocks to
 * read, only the flat string `extractDocumentText` already produced, so this
 * is that piece of work, scoped to exactly what an uploaded document needs:
 * paragraphs standing in for blocks, a blank line standing in for the
 * boundary between them, and nothing claiming to be a heading (a plain-text
 * or a PDF extraction has no reliable way to tell one from a paragraph, so
 * claiming otherwise would just fabricate section boundaries `chunkDocument`
 * would then treat as if a human had marked them).
 */
function paragraphsOf(text: string): readonly ChunkableBlock[] {
  return text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph, index) => ({ id: String(index), text: paragraph }))
}

export interface ReferenceDocumentIngestOptions {
  readonly store: VectorStore
  readonly embeddings: EmbeddingProvider
  readonly siteId: string
}

/**
 * Chunks, embeds and stores one uploaded reference document under the
 * reserved pseudo-collection (`types.ts`). `documentId` is the
 * `ReferenceDocumentStore` row's own id — reusing it as the vector
 * `entryId` is what lets `removeReferenceDocument` and a re-upload address
 * exactly the chunks this document produced, the same way a content entry's
 * id already does for `withVectorIndexing`.
 */
export async function ingestReferenceDocument(
  document: Pick<ExtractedDocument, 'filename' | 'text'>,
  documentId: string,
  options: ReferenceDocumentIngestOptions,
): Promise<{ readonly chunkCount: number }> {
  const blocks = paragraphsOf(document.text)
  if (blocks.length === 0) return { chunkCount: 0 }

  const chunks = chunkDocument({
    documentId,
    title: document.filename,
    blocks,
  })
  if (chunks.length === 0) return { chunkCount: 0 }

  const vectors = await options.embeddings.embed(chunks.map((chunk) => chunk.text))

  const records: VectorRecord[] = []
  chunks.forEach((chunk, index) => {
    const vector = vectors[index]
    if (vector === undefined) return
    records.push({
      siteId: options.siteId,
      collection: REFERENCE_DOCUMENT_COLLECTION,
      entryId: documentId,
      locale: REFERENCE_DOCUMENT_LOCALE,
      status: REFERENCE_DOCUMENT_STATUS,
      chunk,
      vector,
    })
  })

  await options.store.upsert(records)
  return { chunkCount: records.length }
}

/** Removes every chunk a document produced — an upload's own undo, and what a delete from the admin screen calls. */
export async function removeReferenceDocumentVectors(
  store: VectorStore,
  siteId: string,
  documentId: string,
): Promise<void> {
  await store.removeEntries({
    siteId,
    collection: REFERENCE_DOCUMENT_COLLECTION,
    entryIds: [documentId],
  })
}
