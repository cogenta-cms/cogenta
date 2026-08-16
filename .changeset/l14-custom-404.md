---
'@cogenta/core': minor
'@cogenta/cli': minor
---

Serve a site's own page for an unmatched URL (L14 task 2)

`cogenta serve` answered every unmatched public URL with a bare JSON error.
It now renders the site's own 404 page instead, with a real 404 status.

The 404 body is an ordinary published entry at `site.notFoundPath` (`/404` by
default, overridable in `cogenta.config` or via `COGENTA_SITE_NOT_FOUND_PATH`)
— editable in the admin like any other page, and rendered by exactly the same
function, through exactly the same permission-checked gateway, as every other
page. So a draft 404 page is not shown to the public, and a site that has not
written one still gets the plain refusal it got before. The lookup happens at
most once per request: the 404 path itself is never re-resolved.
