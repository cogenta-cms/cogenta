---
'@cogenta/theme-canonical': minor
---

Consumes contract D `theme@1.4` (L25 D2): `renderChrome` shows `tagline` under the site
name in the footer, `social` as an icon-link row (`renderSocialLinks`,
`@cogenta/theme-kit`), `footerNote` as a short "about" column, and `headerAction` as a
button-styled link at the end of the header nav. `renderPage` now renders
`renderEntryHeader` (cover, byline, date, terms, reading time) in place of the bare
`.cg-page__title` heading when `PageContent.entry` is present and no `hero` block already
draws its own `<h1>`. `featureGrid` items now render a real inline icon
(`renderIcon`, `@cogenta/theme-kit`) inside the existing `.cg-feature__icon` chip, for
every name in the new ~50-name vocabulary; an unrecognised name keeps the pre-L25 empty
chip.

All four are optional and additive: a render that sets none of the new `ChromeInput`
fields, and a page with no `entry` meta, both produce byte-identical output to before
this change (`test/chrome.test.ts`, `test/entry-header.test.ts`).
