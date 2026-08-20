---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
---

Add optimistic concurrency detection and per-field error naming for the entry editor (fiche 02, tasks 3 and 7).

- `@cogenta/core` gains the `CONTENT_STALE_WRITE` error code.
- `@cogenta/schema`'s `UpdateInput` gains an optional `expectedUpdatedAt`. When a caller
  passes it, `update()` compares it against the live row's `updatedAt` and refuses with
  `CONTENT_STALE_WRITE` (409) if someone else's write landed first, instead of silently
  overwriting it. Omitting it keeps the previous last-write-wins behaviour unchanged.
- `@cogenta/api`'s `PATCH` body accepts the new `expectedUpdatedAt`, and `errorResponse`
  now includes `error.field` for `CONTENT_INVALID`/`CONTENT_SLUG_INVALID` refusals, naming
  the schema-declared field the error is about so a client can drive per-field validation
  UI without parsing the message.

Both additions are additive and backward compatible: existing callers that never send
`expectedUpdatedAt` see no behaviour change, and `error.field` is only ever present for
the two codes listed above.
