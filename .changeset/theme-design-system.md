---
"@cogenta/theme-canonical": minor
"@cogenta/cli": minor
---

Give the canonical theme a real design system, and make `cogenta serve` actually send it.

`src/styles/theme.css` is now three layers — `tokens.css` (the design system),
`base.css` (document, accessibility, page frame, actions) and `blocks.css` (the twelve
vocabulary blocks). Every value in all three is still derived from contract D's closed
skin token set: spacing from `--cogenta-space-unit` and `--cogenta-space-scale`, type from
the seven `--cogenta-font-size-*` steps `renderSkin` emits, colour from the seven colour
tokens through `color-mix()` and relative `oklch()`. No token was added to the contract and
no colour literal was added to the theme.

**Two real bugs fixed on the way.** The stylesheet referenced `--cogenta-color-accentFg`,
`--cogenta-color-mutedFg` and `--cogenta-font-baseSize`, but `renderSkin` kebab-cases token
names, so the real properties are `--cogenta-color-accent-fg`, `--cogenta-color-muted-fg`
and `--cogenta-font-base-size`. Every muted text colour, every primary button label and the
entire typographic scale therefore resolved to nothing. A new test derives the expected
property names from the skin and fails on any future misspelling.

And `cogenta serve` sent the skin's generated custom properties but never the stylesheet
that uses them, so every served page was styled by the browser's defaults with a skin
defined and unused. It now inlines the theme's sheet — `@import`s flattened, comments
dropped, whitespace squeezed — next to the skin's, and renders the same page frame
`Base.astro` builds: a skip link, a site header with a home link, and a footer.

**Dark mode, designed rather than inverted.** A `light-dark()` palette behind an
`@supports` guard, with `color-scheme` declared so native controls follow. Elevation is
expressed as lightness rather than shadow, the accent is lifted and its foreground
consequently flipped to ink, borders become lighter overlays, and text stays off pure
white. `design-system.test.ts` computes every one of those colours from the real stylesheet
— resolving `var()`, `light-dark()`, `color-mix(in oklab, …)` and `oklch(from …)` — and
asserts AA body contrast on fourteen pairs in both schemes.

`Site.skinCss` is now `Site.styles`, and `assembleSite`'s last parameter with it.
