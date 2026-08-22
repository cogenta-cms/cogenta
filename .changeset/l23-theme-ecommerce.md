---
'@cogenta/cli': minor
---

Add `@cogenta/theme-ecommerce`, a second installable public-site theme
("Storefront") built on the `@cogenta/theme-kit` foundation (fiche L23):
a confident, product-grid-native retail identity across all twelve
contract-B blocks — shoppable cards with consistent aspect ratios and hover
lift, a full-bleed accent-colour promotional panel for `cta`, a horizontal
"as seen in" trust strip for `logos`, tabular social-proof numbers for
`stats` — with its own `renderChrome` (a bolder header, a multi-column
footer) and a genuinely distinct light/dark design system (bright,
high-contrast light mode by default; a real, separately designed dark mode,
not an inversion). Registered in `theme-registry.ts`'s `BUILTIN_THEMES` and
`@cogenta/cli`'s own `dependencies`, so it is selectable from the appearance
screen's theme picker alongside the canonical reference theme, with no
change to any existing site's rendering. Zero client JavaScript, WCAG 2.2 AA
contrast verified in both colour schemes by a real computed-contrast test
suite (233 tests).
