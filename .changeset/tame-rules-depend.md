---
'@cogenta/render': minor
---

Wire the page cache's dependency collection to what the content API declares a response
was built from, closing the gap a server-side relation expansion left open: an article
page that inlines its author had no way to know the author changed, because the
author's id never crossed the content client as a request of its own. The HTTP client
now reports `meta.dependencies` from every response through an `onDependencies` hook,
consumed by the render cache alongside what it already records directly.
