# @cogenta/theme-association

## 0.2.0

### Minor Changes

- 8a13e08: New theme package (L25, Phase 1): a warm, human theme for a nonprofit or
  community group — Nunito + Source Sans 3, a deep-green accent on a light
  warm off-white ground, a genuine dark mode (forest green, not an inverted
  grey), generously rounded cards and buttons. Implements all seventeen
  `blocks@2.0` vocabulary blocks, `theme@1.4` chrome (tagline, social links,
  footer note, header action), a term archive, zero client JavaScript, zero
  literal colour (every value derives from the skin's own tokens), WCAG AA
  contrast verified in both colour schemes. 232 tests.
  
  Ships alongside the `association` blueprint (`create-cogenta`), which
  activates this theme by default, seeds an `event` collection with six
  future-dated demo events (each carrying a "When / Where" panel) and six
  content pages, and renders procedural demo visuals (hero backdrop, event
  covers, a gallery, a volunteer avatar, partner marks) through the real
  media pipeline.

### Patch Changes

- 1df80de: L25 (D5, a binding product rule: a gradient reads as the generic
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
- a915e1a: Fixes from the final live review of every scaffolded blueprint (L25): the association
  theme's event cards stack their cover over a date + text row and never exceed three
  columns (a fourth column broke every word in two); embed placeholders name the provider
  ("Open on YouTube", "Open the original") instead of printing its raw id; cover art walks
  its flat families by seed so consecutive covers never repeat; the magazine front page no
  longer opens on the same story twice.
- Updated dependencies [4335296]
- Updated dependencies [722fc6b]
- Updated dependencies [7a59646]
- Updated dependencies [562c9c1]
- Updated dependencies [a15b1ae]
- Updated dependencies [befad6d]
- Updated dependencies [a915e1a]
- Updated dependencies [86fc9cf]
- Updated dependencies [54409f3]
- Updated dependencies [a6530f6]
- Updated dependencies [1995d35]
- Updated dependencies [4335296]
- Updated dependencies [05f9e29]
  - @cogenta/blocks@1.0.0
  - @cogenta/theme-kit@0.2.0
  - @cogenta/render@0.2.0
