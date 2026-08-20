---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/commerce': patch
'@cogenta/cli': patch
---

Add global search: the ⌘K/Ctrl+K palette with shortcuts and "go to"/"create" actions, a full `/search?q=…` results page, highlighted excerpts, widened sources (orders, media, users, menus, extensions, taxonomy terms), typed inline filters (`status:draft`) and recent-search history (fiche 36).

- `@cogenta/schema`'s search indexing (`extract.ts`) gains `buildExcerpt` — a window of prose
  around the first query term found, with match offsets scoped to that window, never the
  full text. Built from the *display* text (`SearchDocument.body`, never folded), so an
  excerpt keeps real casing and accents while still matching a folded, prefix-matching
  query.
- `@cogenta/api`'s `search-router.ts` enriches each `SearchHit` with an excerpt built
  server-side, never reconstructed from HTML on the client (R3/R8: the excerpt is data,
  escaped at render).
- `@cogenta/commerce`'s order store and admin router gain a search-by-number/email lookup,
  gated on the caller's own `commerce.read` permission — a source in the global search
  widens only what its own permission already allows, never more.
- Admin: `shell/global-search.tsx` (palette, shortcuts, recent searches, inline-filter
  parsing), `routes/search.tsx` (the full results page, one tab per source with its own
  permission gate), `search/` (excerpt highlighting, inline-filter parser, recent-search
  `localStorage` store — never server-side, these are one person's own queries).
