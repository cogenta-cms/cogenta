---
'@cogenta/theme-magazine': minor
---

Pro pass on the magazine theme (L25): a structured, flat "front page" redesign that keeps
the Fraunces + Public Sans identity, built on `theme@1.4`.

Masthead: the top strip now names today's date (`Intl.DateTimeFormat(locale, { dateStyle:
'full' })`) instead of a static tagline; a quiet rubric row carries the site's own nav plus
`headerAction` as a filled button; a CSS-only `<details>` disclosure collapses the rubric
into a hamburger below `56rem`, with a real, always-native `<nav>` shown in its place above
it (never one `<details>` forced open at width — a closed `<details>`'s non-summary content
cannot be laid out by an author `display` override in a real browser). The colophon is now a
dense four-column footer: brand + tagline, a section index, social icons (`renderSocialLinks`),
and a closing note with the branding fragment.

`collectionList`'s three layouts are now genuinely distinct: `grid` ("Top stories") gives its
first entry a full-width lead — 16:9 cover, section eyebrow, headline, full excerpt — followed
by the rest as a 3-column card grid (cover, eyebrow, title, date); `list` is a rubric rail of
compact rows with a small thumbnail when the entry has a cover image, a numbered index
otherwise; `carousel` stays a horizontal-scroll row of uniform, image-led frames. A card's
section eyebrow is read from the entry's own `section`/`category`/`topic`/`department` field —
the same "usual field name, never invented" convention `entryImage`/`entryExcerpt` already
follow, extended locally since contract D's `PageEntryMeta.terms` only resolves taxonomy
classifications, never an arbitrary `select` field.

An article page now renders `renderEntryHeader`'s furniture (classification eyebrow styled in
the masthead's own journal-red accent, a big serif headline, a dek, an editorial meta line
between two hairlines, and a full-bleed 16:9 cover) instead of the bare title every other page
falls back to.

Also fixes a real bug from the theme's original L23 build: `src/index.ts` never re-exported
five of its seventeen block renderers (`accordion`, `logo-strip`, `pricing-table`,
`stat-counter`, `testimonial`) — a consumer importing them from the package root got a
type error the theme's own tests never caught, since every internal test imports from the
relative `src/render/...` path instead.

256 tests (up from 240), including new coverage for the theme@1.4 chrome fields (date,
`headerAction`, tagline, social links, footer note) and the `renderEntryHeader` integration.
Zero gradients, zero decorative blur (D5), zero literal colour (verified by test), WCAG AA
contrast in light and dark, no new npm dependency.

**Known, deliberate limitation** (see the blueprint's own comment): the `magazine` blueprint
keeps `article.section` a plain `f.select` field rather than a taxonomy, so a `collectionList`
card can read it raw with no resolve step this theme's synchronous renderer has any way to
perform. The trade-off is that the article page's own `renderEntryHeader` eyebrow — which only
resolves taxonomy classifications — never shows a rubric for this blueprint's own demo content,
even though the mechanism (and its accent-red styling) is real and works for any collection
that does declare a taxonomy.
