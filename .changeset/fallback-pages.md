---
'@cogenta/cli': minor
---

A dead link shows a page, and a site with no home page says it works

Every URL a site could not answer used to return the API's JSON error to the
visitor, unless someone had created a page at `site.notFoundPath`. `cogenta
serve` now renders its own not-found page in the active theme's chrome (header,
footer, stylesheet, a way home and a search field), with a `404` status. A site
entry at `notFoundPath` still takes precedence, and `/api/*` still answers JSON.

`/` with nothing behind it — a site installed a minute ago — now shows a short
welcome page pointing to the administration (`200`, `noindex`), instead of an
error. It disappears as soon as a home page exists. Both pages speak French or
English according to the site's default locale.
