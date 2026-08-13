---
'@cogenta/api': minor
---

Add the GraphQL API, generated from the collections and served over the same permission
layer as REST.

The schema is derived, not written: each collection produces one type carrying its
declared fields and every system field of contract A, a cursor connection, a filter
input, a pair of mutation inputs, and the five mutations — create, update, delete,
publish and restore. A field added to a collection appears in the SDL, in the filter and
in the mutation inputs at once, exactly as it already appears in `.cogenta/types.d.ts`.
`renderSdl()` prints the very schema that answers the queries, so the published SDL can
never drift from the executable one.

GraphQL is a transport here, not a second engine. Queries go through the same
`PermissionLayer` and the same filter vocabulary as REST — equality, comparison, `in`,
`contains`, `exists`, `and`, `or` — and there is deliberately no escape hatch: no raw
`where`, no `state:` argument, no way to name a draft. The state an actor reads is
derived from the permission layer, so the `public` role cannot reach an unpublished
entry by identifier, by listing, by filtering on `status`, through an alias or through a
relation. A preview token is honoured for the single entry it names, checked per entry
on every path including the batched relation loader.

Pagination is by cursor. The `endCursor` of a page is the position of the last entry
actually handed out, so a page whose entries were filtered in memory still continues
where it stopped, and concurrent insertions cannot make a reader see an entry twice.

Relation expansion is bounded, with a low default of two hops, because relations can be
circular; the `depth` argument may lower the bound but never raise it. Related entries
are resolved through a small hand-written dataloader that batches by tick and
de-duplicates, so a page of twenty articles by two authors costs two reads rather than
twenty.

Errors rendered to a client carry a stable code, a fixed message and a fixed hint, taken
from a table keyed by the error code. No bound parameter, no identifier, no SQL and no
stack can reach a GraphQL response; the full error goes to the logger instead. Parse and
validation errors are the one exception and are returned verbatim, since they run before
any variable is coerced and can only quote the document the caller just sent.

New direct dependency: `graphql` (MIT, the reference implementation maintained by the
GraphQL Foundation). Cogenta needs a spec-compliant parser, validator and executor;
writing one would be thousands of lines of security-relevant code for no gain, and every
GraphQL client tool expects the real thing. The dataloader, by contrast, is thirty lines
and is written here rather than added as a second dependency.
