---
'@cogenta/schema': patch
---

Put an un-trashed entry back in the search index.

`withSearchIndexing` wrapped create, update, publish, unpublish,
setVisibility, restore and delete — and not `untrash`. Since `delete` drops
the index row, restoring an entry from the trash gave it back to the site, to
the sitemap and to its relations while leaving it permanently unfindable by
search, in the admin and on the public `/search` alike. Any later edit
repaired it, so the entries that stayed broken were exactly the ones nobody
touched again.

The trash is reversible by design (ADR-0022): `delete` keeps everything and
`untrash` gives it back exactly as it was. The index is part of "exactly as
it was".
