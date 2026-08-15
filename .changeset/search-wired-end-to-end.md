---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Full-text search is reachable for the first time (L10 task 3). The engine
(`packages/schema/src/search/`, one driver per database) has existed and
been tested since L1, but nothing anywhere in the repository ever called
`index()` and no route ever called `search()` — so every search returned
nothing, however the query was written.

- **`@cogenta/schema`** gains `withSearchIndexing(store, { collection,
  index, onError })`, a `ContentStore` decorator in the same shape as
  `withReadOnlyStore`. Wrapping the store rather than hooking a router is
  what makes REST and GraphQL both covered by one guard instead of two.
  Its central safety property: after any mutation the **published** face is
  read back first and indexed when it exists, so an unpublished edit to a
  published entry can never be filed under a status a public search reaches.
  A failing index write never fails the content write — the index is derived
  data — and surfaces through `onError` rather than silently.
- **`@cogenta/api`** gains `createSearchRouter` — `GET /api/search?q=…`,
  with `collections`, `status`, `locale`, `limit` and `offset`. Naming a
  collection you may not read is a 403, not a quieter answer; the default
  scope is the readable collections only, and every hit is filtered against
  that same set on the way out. `status` other than `published` requires
  `canReadUnpublished` on every collection in scope.
- **`@cogenta/cli`** creates the index at startup, wraps every collection's
  store with it, mounts `/api/search`, and serves a public `/search?q=…`
  page with a real form and real links (`noindex`, as a search results page
  must be). The public page is a **route, not a contract B block**: contract
  B is frozen and adding a block needs an RFC, which does not belong in a
  lot whose premise is "wiring only".
