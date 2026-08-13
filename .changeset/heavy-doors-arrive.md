---
'@cogenta/api': minor
'@cogenta/core': minor
---

Add `@cogenta/api`: the permission layer, preview tokens, REST and GraphQL.

Both transports run on one permission layer, as the lot requires. The hardest rule —
the `public` role never reaches a draft, on any route, in either transport, whatever the
query says — is enforced structurally rather than by condition: `canReadUnpublished`
strips `public` from the actor's roles before looking at anything, so even a collection
misconfigured with `update: ['public']` cannot become draft access.

A preview token is the single deliberate exception, and it is scoped to one entry. That
scoping is not free: `canReadUnpublished` is only told which collection is being read, so
a grant for entry A would otherwise unlock every draft in it. Every path that returns
entries filters each one through `previewCovers` — the list, the paginated connection,
reads by id, and relation expansion including the batching loader.

REST is a router over normalised request and response objects, with no HTTP framework and
no listening socket, so it is tested without a server. Filters use a fixed vocabulary and
values are coerced from the declared field kind, because a text comparison would rank
`"10"` below `"9"`. GraphQL derives its schema from the collections, prints the same
object it executes, and batches relation reads through a thirty-line dataloader written
here rather than taken as a dependency.
