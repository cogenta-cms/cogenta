import type { DocumentFormat } from '../../documents/extract-text.js'

/**
 * L22 task 4 — "un flux d'upload de documents additionnels", wired onto the
 * existing extraction → chunking → vectorisation pipeline (L19/L18) rather
 * than a second one.
 *
 * A reference document is not content: it has no collection, no locale
 * variants, no draft/published lifecycle. It still needs a home in the
 * vector index so `assist.chat` can retrieve it — `VectorRecord` requires a
 * `collection`/`entryId`/`locale`/`status` (task 5's `VectorScope`), so this
 * pseudo-collection name is the answer to "what collection is a reference
 * document in?".
 *
 * `^_` can never collide with a real collection name:
 * `defineCollection`'s own `COLLECTION_NAME_PATTERN` is
 * `/^[a-z][a-z0-9_]*$/`, which requires a *letter* first. Starting with an
 * underscore is therefore a name no `defineCollection` call can ever
 * produce, on any site, without needing a registry or a reserved-word list
 * kept in sync by hand.
 */
export const REFERENCE_DOCUMENT_COLLECTION = '_reference_documents'

/** `locale` a reference document's chunks are stored under — it has no translations, so one sentinel value stands in for "not localised". */
export const REFERENCE_DOCUMENT_LOCALE = 'und'

/**
 * `status` a reference document's chunks are stored under. Reusing the
 * content lifecycle's own `'published'` value (rather than inventing a new
 * one) is what lets `assist.chat`'s hard-coded `status: 'published'` filter
 * retrieve it with no change to that tool — a reference document is exactly
 * as quotable as a published entry, the moment it finishes indexing.
 */
export const REFERENCE_DOCUMENT_STATUS = 'published'

export const REFERENCE_DOCUMENT_STATUSES = ['pending', 'indexed', 'error'] as const
export type ReferenceDocumentStatus = (typeof REFERENCE_DOCUMENT_STATUSES)[number]

export interface ReferenceDocumentRecord {
  readonly id: string
  readonly siteId: string
  readonly filename: string
  readonly format: DocumentFormat
  readonly characters: number
  /** Chunks actually embedded and stored. `0` until indexing finishes. */
  readonly chunkCount: number
  readonly status: ReferenceDocumentStatus
  /** Set only when `status === 'error'`. */
  readonly errorMessage: string | null
  /** `extractDocumentText`'s own warnings (e.g. "PDF page 4 has no text layer") — shown, never hidden. */
  readonly warnings: readonly string[]
  readonly uploadedAt: string
  readonly uploadedBy: string | null
  /** Set once indexing finishes successfully. */
  readonly indexedAt: string | null
}
