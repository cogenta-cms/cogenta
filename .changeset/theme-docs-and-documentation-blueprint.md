---
'@cogenta/theme-docs': minor
---

L25 Phase 1 — a new documentation theme, built to `theme@1.4`: Docusaurus/GitBook
register, IBM Plex Sans + IBM Plex Mono via Google Fonts, a neutral blue-grey palette
with one blue accent (`#1d4ed8`), slate in dark mode.

All seventeen contract-B blocks, a chrome with a genuine CSS-only mobile menu (a
`<details>` disclosure duplicating the desktop nav, hidden by `display:none` at the
inactive breakpoint so nothing extra reaches the accessibility tree), a footer in three
columns (brand + tagline + socials, footer nav, an "about" note plus Cogenta's own
credit).

The one structurally new piece: a doc page renders as two columns, CSS-only. The
sidebar comes from the page's own *first* block — a `collectionList` on `doc_page` the
`documentation` blueprint seeds on every doc page for exactly this purpose — grouped by
the entry's own `section` field and ordered by its own `order` field (neither is a valid
`collectionList.sort.field`, so the theme re-groups and re-sorts the already-fetched
slice itself). The current page is highlighted by comparing each candidate's own
`entryHref` against `ctx.url.pathname`; the same comparison supplies the section name for
a "section › title" breadcrumb. The sidebar renders in **two copies**, not one shared
`<details>` toggled by breakpoint: verified live in a real Chrome tab, a single
`<details>` forced open above the two-column breakpoint by a higher-specificity
`display: block` rule rendered an *empty* sidebar column at 1280px, because Chrome hides
a closed `<details>`'s non-summary content through its own internal
`::details-content` box rather than through the plain CSS the spec text describes — a
content-side `display` override does not reliably win against that. The desktop column
is therefore a plain, always-live `<nav>` (nothing to collapse), and only the
narrow-viewport copy is a real `<details>` ("On this site") — exactly the technique the
header's own CSS-only mobile menu already uses, and for the same reason: exactly one
copy is ever `display: block` at a given width, so a screen reader is never offered two
"Documentation" navigations at once.

`prose.ts` promotes a rich-text paragraph whose only content is a single `code`-marked
span (the one "code block" shape contract A's frozen rich-text schema can express) to a
real `<pre><code>` — the only theme-side post-processing of `@cogenta/theme-kit`'s own
`renderRichText` output, and the reason this theme's doc pages have honest, readable
code samples rather than an inline `<code>` wrapped in a paragraph.

`collectionList` also gains a second shape for the home page's "All guides" index: on
the `doc_page` collection specifically, entries are grouped by section (alphabetical) and
ordered by their own `order` field, rendered as a compact multi-column table of contents
rather than the general row list (which shows `entryImage` — `theme@1.4` — when the
entry carries one, alongside every other collection).

≥150 tests: 17 block suites, the shared design-system/isolation/font-display/tokens/page/
chrome/chrome-brand/theme-block-variant/theme-block-fallback/term-archive suites (the same
discipline every L23/L25 theme carries), and a doc-page-specific suite covering the
sidebar's grouping, current-page highlight, breadcrumb and the code-block promotion.
Zero client JavaScript, zero literal colour (test), WCAG AA computed in both schemes, no
new npm dependency.
