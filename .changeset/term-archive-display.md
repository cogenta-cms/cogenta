---
"@cogenta/schema": minor
"@cogenta/core": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/theme-kit": minor
---

A site owner now chooses, per taxonomy term, what the term's public page (`/{taxonomy}/{slug}`) shows. Five modes: `entries` (the new default: only the entries filed directly under the term, **no sub-term list**), `subterms`, `entries-and-subterms`, `subtree` (the term's entries plus every descendant's, deduplicated, newest first) and `subtree-and-subterms`. A term with no stored setting behaves as `entries`, so a theme that used to draw the sub-term list under every parent term no longer does until the owner asks for it.

The setting is a host-owned presentation setting kept outside contract A (a term gains no field, `schema@2.5` does not change): `@cogenta/schema` exports `createTermArchiveDisplayStore`, `ensureTermArchiveDisplayTable`, `TERM_ARCHIVE_DISPLAY_MODES` and `assertTermArchiveDisplayMode` (table `cogenta_term_archive_display`, covered by `cogenta backup`/`restore`); `@cogenta/core` adds the `TERM_ARCHIVE_DISPLAY_INVALID` error code. `@cogenta/api`'s taxonomy router gains `GET`/`PUT /{taxonomy}/{id}/archive-display` (read needs `read`, write needs `update` on the taxonomy; deleting a term, with or without `cascade`, forgets its setting) and maps the new code to 400. `cogenta serve` applies the mode to the page, its pagination and `/sitemap.xml`, which lists a term page only when it shows something under its mode; its fallback archive (for a theme without `renderTermArchive`) now draws the sub-term list too.

Contract D moves to `theme@1.11`, strictly additive: `TermArchiveInput.showEntries?: boolean` (absent means `true`). When `false`, a theme draws neither the entry list nor the "nothing is filed here" message nor the pager.
