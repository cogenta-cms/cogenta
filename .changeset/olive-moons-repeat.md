---
'@cogenta/theme-kit': minor
'@cogenta/theme-canonical': minor
'@cogenta/theme-portfolio': minor
'@cogenta/theme-magazine': minor
'@cogenta/theme-ecommerce': minor
'@cogenta/theme-entreprise': minor
'@cogenta/cli': minor
---

Taxonomy terms finally have a public page (contract D `theme@1.3`, additive).

ADR-0022 shipped native taxonomies and the admin has let an editor point a menu item
at a term ever since — and `resolveMenuTerm` answered `route: null` for every one of
them, honestly, because no site rendered such a page. A term was a filing cabinet with
no door.

- `GET /{taxonomy}/{term-slug}` lists every published entry filed under a term, newest
  first, across every collection that classifies with it. `?page=N` paginates; page 2
  and beyond are `noindex, follow` with a canonical of their own.
- `@cogenta/theme-kit` gains `TermArchiveInput` and `ThemeModule.renderTermArchive` —
  **optional**: a theme that does not implement it still serves the page, in its own
  chrome, through a plain host-rendered list. The five built-in themes each implement
  it with their own layout, reusing their own `collectionList` card classes so an
  archive looks like that theme's lists rather than a sixth design.
- `resolveMenuTerm` returns a real route, so a taxonomy menu item is a link.
- `/sitemap.xml` lists every term that has something published under it.

Two decisions: the URL pattern is fixed and resolved by the host **after** every real
collection route has failed to match — so a `/blog/:slug` route can never be shadowed,
and a taxonomy needs no `routing` of its own (which would have been a contract A
change ADR-0022 deliberately avoided). And a term archive lists that term only; its
sub-terms are offered as links rather than folded in, so what the page shows always
matches the term that was asked for.
