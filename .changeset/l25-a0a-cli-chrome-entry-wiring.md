---
'@cogenta/cli': minor
---

`cogenta serve` fills contract D `theme@1.4`'s new `ChromeInput` fields and
`PageContent.entry` (L25 D2).

A new `resolveChromeExtras` (`theme-render.ts`) reads `general.tagline`/
`general.socialLinks`/`general.footerNote` through whichever `ThemeRenderOptions.chromeExtras`/
`PageChromeOptions.chromeExtras` reader the caller wires (`chromeExtrasForSite`, `serve.ts`),
and resolves `headerAction` from the first link of the menu assigned to the
`header-action` location — the same generic, name-free menu-location mechanism
`header-nav`/`footer-nav` already use. Wired into all three `renderChrome` call sites
(`renderPageChrome`, the entry page renderer, and — with fixed synthetic values, since
that route reads no database by design — the theme gallery preview).

An entry page (`renderRequestedPage`/`renderDraftPage`) now also builds `PageContent.entry`:
cover image (`entryImage`), excerpt, publication/update dates, the entry's author (its
`createdBy` resolved to a display name through the existing user store, via the new
`ThemeRenderOptions.authorFor`/`authorForSite`), its classified taxonomy terms (via the
new `ThemeRenderOptions.resolveTerm`, reusing the same lookup `resolveMenuTerm` already
made for a menu item pointing at a term — exposed on `Site` as `resolveTaxonomyTerm`),
and a reading-time estimate computed from the collection's `richText` field
(~200 words/minute). Every one of these is optional and additive: a caller that never
wires the new options renders exactly as before.
