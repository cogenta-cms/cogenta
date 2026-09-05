# @cogenta/theme-blog

## 0.2.1

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0

## 0.2.0

### Minor Changes

- 06d7c1d: Add `@cogenta/theme-blog`, a reading-first personal/professional blog theme built on
  the `@cogenta/theme-kit` contract (`theme@1.4`) every theme implements against (L25).
  
  A masthead, not a marketing template: a magazine-cover hero for the featured post,
  serif reading typography (Fraunces for display headings, Source Serif 4 for the
  running text, Inter Tight for UI/meta), an image-forward "Latest" grid (3/2/1 columns
  at 1280/768/360), an editorial "From the archive" list with small thumbnails, a sticky
  header with a zero-JavaScript `<details>` disclosure for the mobile nav and a second,
  always-native `<nav>` shown in its place from `56rem` (a closed `<details>`'s
  non-summary content cannot be forced to lay out by an author `display` override in
  current Chrome — verified against a real browser — so one panel cannot serve both
  breakpoints), and a three-column footer (brand + tagline, nav, social links + credit).
  
  All seventeen contract-B blocks get their own layout — never a recolour of another
  theme. `renderEntryHeader`/`entryImage`/`renderSocialLinks`/`renderIcon` (theme@1.4) are
  used throughout: a post page shows its taxonomy terms as an eyebrow, byline, reading
  time and 16:9 cover; every card shows its entry's cover image when one is set. Zero
  client JavaScript, zero literal colour in CSS (verified by test), a genuine dark mode
  ("deep ink", never inverted grey) designed with `light-dark()`/`oklch(from …)`, WCAG AA
  contrast computed by test in both schemes, 210 tests. No new npm dependency (fonts via
  Google Fonts `@import`, as every other Cogenta theme already does).

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
