---
'@cogenta/theme-saas': patch
'@cogenta/theme-blog': patch
'@cogenta/theme-restaurant': patch
'@cogenta/theme-association': patch
'@cogenta/theme-docs': patch
---

L25 (D5, a binding product rule: a gradient reads as the generic
"AI-generated" look) — every `linear-gradient()`/`radial-gradient()` and
every decorative `backdrop-filter`/`filter: blur()` is removed from the five
themes this worktree owns (`theme-saas`, `theme-blog`, `theme-restaurant`,
`theme-association`, `theme-docs`). This completes the sweep started by the
A0e changeset, which covered `canonical`, `ecommerce`, `entreprise`,
`magazine` and `portfolio`.

Each removal is a deliberate flat replacement, not a hole:

- **Hero backdrop** (`theme-saas`): two blurred mesh-gradient halos behind
  the hero become two crisp flat geometric accents instead — a solid
  quarter-circle disc behind the copy and a solid offset panel behind the
  media frame, in the same accent tones, with no blur.
- **Card and hero-frame borders** (`theme-saas`): the shared "faint gradient
  border" trick (a transparent border painted from a second gradient
  background layer, used by pricing tiers, testimonials, quotes, figures,
  panels and list rows, plus the hero media frame) becomes a single flat
  hairline border colour-mixed from the accent and line tokens — still
  reads as "tinted at the edge", never a wash.
- **Highlighted pricing tier** (`theme-saas`): the accent-to-transparent
  gradient border on the featured plan becomes a flat, thicker
  (`2px solid var(--cg-accent)`) border — still visually distinct from the
  regular tier and from the impact band's own full-fill register.
- **Impact band** (`theme-saas`, `statCounter` block): a diagonal
  `linear-gradient` fill becomes a flat solid `var(--cg-accent)` fill.
- **FAQ plus mark** (`theme-saas`, `theme-blog`): two
  `linear-gradient(currentColor, currentColor)` layers standing in for a
  cross — already flat in effect, but literally a gradient function — are
  replaced by a single solid `background: currentColor` clipped with
  `clip-path` into the same cross shape (the same technique already used by
  `theme-entreprise`).
- **Hero scrim** (`theme-restaurant`): a three-stop `linear-gradient` fade
  from opaque to transparent over the hero photograph becomes a single flat
  semi-transparent veil (`--cg-scrim`, retuned to 55%/62% light/dark) —
  the hero's content is centred over the whole image, not pinned to the
  bottom, so contrast needs to hold everywhere in the frame, not just near
  a caption. `--cg-scrim-soft` (only ever used as the gradient's other
  stop) is removed as now-dead.
- **Hero halo "mat"** (`theme-association`): a blurred `radial-gradient`
  glow behind the hero photo becomes a flat accent-soft "mat" — solid
  colour, crisp rounded-rectangle edge, like coloured card stock peeking
  out from under a framed print.
- **Sticky header** (all five): `backdrop-filter: saturate(...) blur(...)`
  frosted-glass headers become fully opaque flat panels
  (`background: var(--cg-canvas)`), still separated from the page by the
  existing hairline border. `theme-docs` had only this one blur to remove.

No colour, spacing, radius or duration token changes beyond the scrim
retuning above; every replacement still resolves entirely from the skin
(zero literal colours, checked by each theme's own `isolation.test.ts`,
which now also asserts zero `gradient()` and zero decorative blur across
every stylesheet and every `.ts` file under `src/render/` — none of the
five themes' render sources had any to begin with). Dark mode is
unaffected — every flat fill above is a skin token, so it repaints
correctly in both schemes without further changes.

Verified per theme: `typecheck` and the full test suite (theme-saas 265,
theme-blog 212, theme-restaurant 223, theme-association 234, theme-docs
218 — all green, two tests higher than before per theme, for the two new
D5 assertions). A scaffolded `saas` blueprint site (the worst offender —
nine gradients, two blurs) was built, served, and inspected live in a
browser in both light and dark mode: the hero's flat disc-and-panel
backdrop and the flat plus-mark FAQ icons read as deliberate geometric
elements, not a hole where a glow used to be.
