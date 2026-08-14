---
'create-cogenta': minor
---

`create-cogenta` — the `blog` blueprint's page types (L9 task 4): a `page`
collection (`title` + a real block zone, routed at `/:slug`), formalising the
title-plus-blocks shape `theme-canonical`'s own test fixtures already used for
internal-link targets. Two demo pages are seeded through the real
`ContentStore` alongside the existing posts/categories/tags: `home` (a `hero`
block plus a `collectionList` of recent posts) and `about` (a `prose` bio) —
both rendered generically by `@cogenta/theme-canonical`'s existing
`renderPage`/`renderBlock`, with no new rendering code required.

Investigation found the block-composition and single-entry URL routing
(`@cogenta/schema`'s `matchPath`/`buildPath`) already generic across any
collection with a `routing.pattern`; what did not exist anywhere yet was an
actual runnable site (no `src/pages/`, no Astro scaffold) to invoke either —
building that is out of this task's scope and is called out honestly rather
than invented.
