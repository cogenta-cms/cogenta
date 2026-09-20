---
'@cogenta/cli': patch
---

Serve a stored rendition for a width below the variant ladder.

`/_image?id=…&w=1` answered with the full-resolution original — megabytes for
a one-pixel request, on a public endpoint, cached `immutable` for a year. Any
width that was not exactly a rung did the same: the lookup matched names
exactly, found nothing, and fell back to the whole file.

The smallest rendition at least as wide as the request is used instead. A
width above everything stored still falls back to the original, which is the
closest thing there is. Nothing is rendered on demand, exactly as before.

`/api/media/{id}/file?w=` follows the same rule, being the same lookup.
