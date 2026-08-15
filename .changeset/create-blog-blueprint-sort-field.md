---
'create-cogenta': patch
---

Fix the blog blueprint's home page failing every real query with
`QUERY_INVALID`.

Its `collectionList` block sorted recent posts by `publishedAt` — a real
system field, but nullable (a draft has none) and never part of the real,
frozen `SortField` union (`id`/`createdAt`/`updatedAt` only; cursor
pagination needs a column that is never null). Every other blueprint
already sorted by `createdAt`; blog was the one exception, and nothing
exercised its `collectionList` block through the real gateway until
`cogenta serve`'s new theme-render fallback did (see the `@cogenta/cli`
changeset) — the existing render test built its own query by hand instead
of going through the block's real `query()` function, so it never caught
this. Now sorts by `createdAt`, same as every other blueprint.
