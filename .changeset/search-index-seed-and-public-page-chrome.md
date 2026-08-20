---
'create-cogenta': patch
'@cogenta/cli': patch
'@cogenta/theme-canonical': patch
---

L20 audit, two real bugs in public-facing pages.

**`/search` found nothing, even for words plainly on a freshly scaffolded
site's own seeded demo content.** Every blueprint's `seedDemoContent`
(`create-cogenta`) and `resetPlaygroundData`'s reseed write straight through
`createContentStore`, never through the `withSearchIndexing`-wrapped store
`cogenta serve` builds at startup — so the seeded rows existed in the content
tables but never reached the search index table. Both now reindex every
seeded collection against the site's real search index (`createSearchIndex` +
`reindexAll`, the same pair `cogenta`'s own "Reindex search" tool uses)
immediately after seeding, so the physical index and the content it describes
are never out of step from the moment a site exists.

**`/search` and `/forms/{name}` rendered with none of the site's visual
chrome**, even though both already linked the site's stylesheet: they built
their own thin `<html>` shell rather than the frame every collection page
gets (skip link, `color-scheme` meta, header with primary nav, footer with
footer nav) — the stylesheet loaded, but the markup its selectors target was
never on the page. `@cogenta/cli` extracts that frame into a new
`renderPageChrome` (`theme-render.ts`) and both pages now call it, menu
wiring included. `renderFormPage`/`renderFormNotFoundPage` are now async and
take an `AccessContext`, to match. The comment thread appended after an entry
page shared the same gap — `@cogenta/theme-canonical`'s `base.css` gains the
missing `.cg-search__*`, `.cg-form__*` and `.cg-comment__*` rules, at the same
page-width measure `.cg-page__title` already sets.
