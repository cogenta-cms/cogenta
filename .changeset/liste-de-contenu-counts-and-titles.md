---
'@cogenta/schema': minor
'@cogenta/api': minor
---

`ContentStore` gains `countByStatus()`, a real `GROUP BY status` count of a
collection's live (non-trashed) entries. `ContentService` gains a matching
`counts()`, and `GET /{collection}?counts=1` now returns a `counts` field
alongside the page — a role that may not read unpublished content only ever
gets the `published` count, never the others (not even as `0`).

The server-side title fallback used for search results (`searchDocumentFor`)
now checks fields named `title`, `name` or `label`, in that priority order,
before falling back to the first declared `text` field — matching the same
convention the admin's collection list, trash screen and relation picker
already use for "what do we call this entry" (fiche 01, "Liste de contenu",
task 1). This can change which text labels a search result for a collection
whose first declared text field is not `title`.
