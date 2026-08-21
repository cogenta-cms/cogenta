---
'@cogenta/render': minor
---

L22 task 7 (documentation refonded — functional, technical, versioned,
deployed): `@cogenta/render` gains a small, hand-written Markdown → HTML
renderer purpose-built for `docs-site/content/**` (`renderMarkdownToHtml`,
`renderMarkdownDocument`, `parseFrontmatter`, `MarkdownDocument`,
`MarkdownHeading`) and `adaptDocHtmlForAdmin`/`DocTree`, which retargets the
static site's relative page links into `/admin/documentation` routes.

Purely additive — no existing export changed shape. Zero new dependency
(R9): a second small hand-written scanner in the same spirit as
`packages/admin/src/rich-text/markdown.ts`'s existing Markdown↔Slate
converter, but for a different, plainer grammar (tables, indentation-driven
list nesting, fenced code with a language tag, heading anchors) that
documentation prose needs and the rich-text editor's grammar doesn't.

This is what lets `docs-site/build/generate.mjs` (the statically published
site) and `@cogenta/admin`'s `/admin/documentation` in-admin browser render
the identical Markdown source through the identical function — the property
the task asked for: never two copies of the documentation that can drift.
