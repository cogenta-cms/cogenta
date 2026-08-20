---
"@cogenta/schema": minor
"@cogenta/api": minor
---

Add `ContentStore.count()` — a single `GROUP BY status` plus a trash count,
never a page scanned client-side — and `ContentService.summary()` /
`GET /-/summary` on top of it: one request that answers every collection an
actor may read with its status counts (`draft`/`scheduled`/`published`/
`archived`/`trashed`/`total`), each figure `null` rather than a fabricated
`0` when the actor may not read that collection's unpublished rows or its
trash. This is the shared implementation the admin's dashboard content
summary widget and the collection list's status tabs both build on. Purely
additive: no existing method, route or response shape changes.
