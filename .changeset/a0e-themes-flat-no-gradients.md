---
'@cogenta/theme-canonical': patch
'@cogenta/theme-ecommerce': patch
'@cogenta/theme-entreprise': patch
'@cogenta/theme-magazine': patch
'@cogenta/theme-portfolio': patch
---

L25 task A0e (D5, a binding product rule: a gradient reads as the generic
"AI-generated" look) — every `linear-gradient()`/`radial-gradient()` and
every decorative `backdrop-filter: blur()` is removed from the five themes
that exist in this worktree today (`canonical`, `ecommerce`, `entreprise`,
`magazine`, `portfolio`; `magazine` already had none). `theme-blog`,
`theme-saas`, `theme-restaurant` and `theme-docs` are not yet merged
(`docs/lots/L25-templates-pro.md` still marks Phase 1 wave 1 "à faire") and
are therefore out of this changeset's scope.

Each removal is a deliberate flat replacement, not a hole:

- **Hero halo** (`canonical`, `ecommerce`): a `radial-gradient` wash behind
  the hero media becomes a flat solid disc (`border-radius: 50%`) in the
  same accent-soft tone. `ecommerce`'s dot-field-plus-fade-mask variant
  collapses to the same flat disc.
- **CTA sheen** (`canonical`, `ecommerce`): a diagonal `linear-gradient`
  "shine" over the call-to-action panel becomes a flat top accent bar
  (`canonical`) or a flat clipped corner triangle (`ecommerce`), at the
  same tint.
- **FAQ plus/minus mark** (`entreprise`, `portfolio`): two
  `linear-gradient(currentColor, currentColor)` layers standing in for a
  cross — already flat in effect, but literally a gradient function — are
  replaced by a single solid `background: currentColor` clipped with
  `clip-path` into the same cross shape.
- **Sticky header** (`canonical`, `entreprise`, `ecommerce`, `portfolio`):
  `backdrop-filter: saturate(...) blur(...)` frosted-glass headers become
  fully opaque flat panels (`background: var(--cg-canvas)` /
  `var(--ce-canvas)`), still separated from the page by the existing
  hairline border.

No colour, spacing, radius or duration token changes; every replacement
still resolves entirely from the skin (zero literal colours, checked by
each theme's own `isolation.test.ts`, which now also asserts zero
`gradient()` and zero decorative blur across every stylesheet and every
`.ts` file under `src/render/`). Dark mode is unaffected — every flat fill
above is a skin token, so it repaints correctly in both schemes without
further changes.

Verified per theme: `typecheck` and the full test suite (canonical 154,
ecommerce 289, entreprise 256, magazine 240 — unchanged, no gradients to
begin with — portfolio 294; all green, counts equal to or above the
pre-existing count). A scaffolded `store` blueprint site (the worst
offender among the themes that exist here, four gradients removed) was
built, served, and inspected live in a browser: the hero's flat accent
disc reads as a deliberate geometric element, not a hole where a glow used
to be.
