---
"@cogenta/theme-saas": minor
---

New theme package (L25, "templates pro"): a Linear/Stripe/Vercel-inspired
SaaS theme. Inter Tight for UI and headings, JetBrains Mono for code and
mono-caps eyebrows, a violet-blue accent (`#5a4aeb`) on a near-white ground,
a mesh-gradient glow behind the hero (pure CSS, no image required), 10px
filled buttons, and cards with a faint gradient border. A designed dark mode
(near-black with the same glows, `light-dark()`/`oklch(from…)`, contract D's
technique) rather than a mechanical inversion.

Implements all seventeen `blocks@2.0` blocks, contract D `theme@1.4` chrome
(sticky header with a CSS-only mobile menu via a visually-hidden checkbox —
no client JavaScript anywhere in the package —, `headerAction` as a filled
button, a four-column footer with tagline/nav/social/footer-note), and the
taxonomy-term archive. `collectionList` shows an entry's own `icon` field
(the same symbol `featureGrid` renders) ahead of its cover image, so a
"Features" listing reads as one system with the feature grid above it.
263 unit tests: contrast in both colour schemes, zero literal colour, zero
`<script>`, WCAG 2.2 AA.
