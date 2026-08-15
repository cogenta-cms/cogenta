---
'@cogenta/cli': minor
---

`cogenta serve` now renders real HTML pages, not just the `/api/*` REST and
GraphQL surface. Until a real Astro build exists (`cogenta build`/`theme` are
still honestly deferred — no static site generation, no theme dev server),
this is a scoped in-process stand-in: a GET request that doesn't match
`/api/*` is resolved against the site's real collection routes
(`matchPath`/`buildPath`, `@cogenta/schema`), the matching published entry is
fetched through the exact same permission-checked `ContentGateway` every
REST and GraphQL request already goes through, and rendered with
`@cogenta/theme-canonical`'s real `renderPage` — the same function the
`create-cogenta` blueprint tests already exercise. A collection with a
`blocks` field renders its real block zone; a `richText`-only collection
(e.g. `post`) gets its body wrapped in a single real `prose` block rather
than a second hand-rolled serialiser. Styling comes from
`@cogenta/render`'s already-tested `renderSkin` against the site's real
`theme.tokens.json`, never a second token-to-CSS mapping.

No secret, database handle or config value ever reaches theme code — only
the same `ContentEntry` shape a real HTTP client would receive through
`@cogenta/theme-canonical`'s own, deliberately separate `ContentEntry`/
`QueryRequest` contract (ADR-0016's boundary holds even in-process).

Scoped deliberately: no image pipeline is wired in yet (a theme asking for
one gets `THEME_IMAGE_UNSUPPORTED`, not a broken `<img>`), and a
cross-reference to an entry this render didn't already fetch resolves to
`#` rather than a guessed URL — a real Astro site would build a full
link-graph ahead of render; this stand-in doesn't.

Found and built while investigating why a scaffolded site had nothing to
show a browser: `cogenta serve` had never rendered a page, only the API.

Building it against a real seeded site surfaced a real, separate bug in
`assembleSite`: the `ContentGateway`'s store map was only ever populated
lazily, by REST's own `storeFor` — a collection no REST request had touched
yet had no store at all, so the very first GraphQL (or now theme-render)
query against it failed with `INTERNAL`/"has no store" instead of a real
answer. `assembleSite` now populates every collection's store eagerly, once,
so REST, GraphQL and the theme-render fallback all see the same complete
map from the first request.

