---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/agents': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

The assistant's vector index is now explained and manageable, not just a raw
count (L22 task 4).

- `GET /api/assistant` now reports, per content collection, whether it is
  included in the index and how many chunks it contributes
  (`vector.collections`), plus the reserved pseudo-collection name reference
  documents are stored under (`vector.referenceCollection`).
- A new site setting, `assistant.indexedCollections` (`GET|PATCH
  /api/settings`, `admin` only), lets an operator exclude a collection —
  published articles included — from the index. The change is read live: it
  applies on the next content save, with no restart, and the existing
  "Reindex vectors" tool applies it to already-indexed content.
- A document upload flow — `GET/POST /api/assistant/documents` and `DELETE
  /api/assistant/documents/:id` — lets an admin add reference material (PDF,
  DOCX, Markdown, plain text) to the same index the site's own content feeds,
  reusing the existing `document.extract_text` → `chunkDocument` →
  `EmbeddingProvider.embed` pipeline rather than a second one. Each document
  tracks its own `pending`/`indexed`/`error` state.
- `@cogenta/agents` gains `createReferenceDocumentStore`,
  `ingestReferenceDocument`/`removeReferenceDocumentVectors`, and the
  `REFERENCE_DOCUMENT_COLLECTION`/`REFERENCE_DOCUMENT_LOCALE`/`REFERENCE_DOCUMENT_STATUS`
  constants a caller needs to retrieve them (e.g. via `assist.chat`'s
  `collections` input).
- `@cogenta/core` gains one error code, `ASSIST_DOCUMENT_NOT_FOUND` (404).

All of this is additive and degrades the same way the rest of L18 does: a
site with no embeddings provider gets none of it, and every other feature
works unchanged (R2).
