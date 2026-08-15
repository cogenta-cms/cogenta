---
'@cogenta/cli': minor
---

`cogenta serve` now serves a real SEO surface instead of a bare `<title>`
(L10 tasks 1-2). `@cogenta/seo` existed, was tested and was imported by
nothing; it is now wired to the running server.

Every rendered page carries a title, a meta description, a canonical URL,
`hreflang` alternates for its linked translations (ADR-0014), Open Graph
and Twitter Card tags, and a JSON-LD block — all derived from the real
entry and the real collection through `buildMetaTags`/`buildJsonLd`, never
hand-written here. An unpublished entry rendered through a preview token
still carries `noindex`, because the gate is the package's own.

Three new routes, all built from the live content:

- `GET /sitemap.xml` (and `/sitemap-N.xml` once a site outgrows the
  50 000-URL protocol limit), listing published, routed entries only.
- `GET /robots.txt`, naming the sitemap and keeping crawlers out of
  `/admin` and `/api/`.
- The redirect table is applied to **every** public GET before route
  matching, so a page renamed last month answers its old URL with the 301
  the rename recorded, query string preserved. It was previously reachable
  only through `/api/content/-/by-path`, which a browser never calls.

`hreflang` lookup is skipped entirely on a single-locale site, so a
monolingual install pays nothing for it.
