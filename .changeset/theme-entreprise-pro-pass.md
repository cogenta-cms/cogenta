---
"@cogenta/theme-entreprise": minor
---

L25 "templates pro" pass: raises `theme-entreprise` to the level of the five
new L25 themes without changing its identity (forest green, structured B2B,
hairline-first elevation).

Chrome now uses all of contract D `theme@1.4`: a real desktop `<nav>` plus a
CSS-only mobile menu (a visually-hidden checkbox and a three-bar `<label>`,
no client JavaScript), `headerAction` rendered as a filled button — replacing
the previous "last header link doubles as the call to action" convention,
which a real `headerAction` field makes dishonest — and a genuine four-column
footer (brand + `tagline`, footer nav, `social` via `renderSocialLinks`, and
`footerNote` beside the Cogenta credit).

`featureGrid` ("our services") is rebuilt from numbered ledger rows into a
card grid, each card led by a real inline glyph (`renderIcon`) inside a flat,
accent-tinted square, capped at three columns on a wide screen.
`collectionList` is rebuilt from a ledger row into a card with a 16:9 cover
(`entryImage`, lazy-loaded, `object-fit: cover`) above the title and excerpt.
`stats` and `cta` are now genuine full-width flat accent bands rather than
cards sitting in the page column. `logoStrip` reads as a tinted trust band.
The hero's media frame gains a soft shadow alongside its existing hairline
border. `renderPage` now draws `renderEntryHeader` (`theme@1.4`) for a routed
entry with no `hero` of its own (a `service` page), with a matching
`.cg-entry-header` stylesheet section. Zero gradients, zero decorative blur
(D5) — unchanged, verified by the existing isolation test. 260 unit tests
(up from 256).
