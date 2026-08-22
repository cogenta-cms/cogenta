---
'@cogenta/cli': minor
---

Add `@cogenta/theme-portfolio`, an ultra-modern creative-portfolio theme built on the
`@cogenta/theme-kit` contract every theme now implements against (fiche L23). It ships
alongside `@cogenta/theme-canonical` in `theme-registry.ts` and `cogenta serve`'s
appearance screen, selectable per site without a restart.

All twelve contract-B blocks get their own distinctive DOM and layout — a numbered
"plate" caption on `mediaFigure` (CSS counters, not stored data), an editorial index
list for `collectionList`, an inverted full-bleed panel for `cta`, a hairline-ruled
"selected clients" ledger for `logos` — rather than a recolour of the reference theme's
markup. Its own default skin (`tokens.json`) picks a near-black-on-near-white palette
with a single electric-violet accent, Bricolage Grotesque/Fraunces/JetBrains Mono via
Google Fonts (each with a real system fallback stack), and its own dark-mode derivation
in `tokens.css`: light mode expresses elevation as a hard offset shadow (from the skin's
own `shadow.sm`/`shadow.md`), dark mode replaces that mechanism entirely with an
accent-tinted glow ring rather than merely dimming the shadow — a distinct design
decision from the reference theme's own dark palette, computed and AA-verified in both
schemes by a real contrast test against the rendered stylesheet.

Zero client JavaScript (asserted: no `<script>`, no `on*` handler, no `client:*`
directive), zero literal colour in any stylesheet, and no new dependency beyond what
`@cogenta/theme-canonical` already uses.
