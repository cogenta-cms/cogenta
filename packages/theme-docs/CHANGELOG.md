# @cogenta/theme-docs

## 0.2.1

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0

## 0.2.0

### Minor Changes

- eb21099: L25 Phase 1 — a new documentation theme, built to `theme@1.4`: Docusaurus/GitBook
  register, IBM Plex Sans + IBM Plex Mono via Google Fonts, a neutral blue-grey palette
  with one blue accent (`#1d4ed8`), slate in dark mode.
  
  All seventeen contract-B blocks, a chrome with a genuine CSS-only mobile menu (a
  `<details>` disclosure duplicating the desktop nav, hidden by `display:none` at the
  inactive breakpoint so nothing extra reaches the accessibility tree), a footer in three
  columns (brand + tagline + socials, footer nav, an "about" note plus Cogenta's own
  credit).
  
  The one structurally new piece: a doc page renders as two columns, CSS-only. The
  sidebar comes from the page's own *first* block — a `collectionList` on `doc_page` the
  `documentation` blueprint seeds on every doc page for exactly this purpose — grouped by
  the entry's own `section` field and ordered by its own `order` field (neither is a valid
  `collectionList.sort.field`, so the theme re-groups and re-sorts the already-fetched
  slice itself). The current page is highlighted by comparing each candidate's own
  `entryHref` against `ctx.url.pathname`; the same comparison supplies the section name for
  a "section › title" breadcrumb. The sidebar renders in **two copies**, not one shared
  `<details>` toggled by breakpoint: verified live in a real Chrome tab, a single
  `<details>` forced open above the two-column breakpoint by a higher-specificity
  `display: block` rule rendered an *empty* sidebar column at 1280px, because Chrome hides
  a closed `<details>`'s non-summary content through its own internal
  `::details-content` box rather than through the plain CSS the spec text describes — a
  content-side `display` override does not reliably win against that. The desktop column
  is therefore a plain, always-live `<nav>` (nothing to collapse), and only the
  narrow-viewport copy is a real `<details>` ("On this site") — exactly the technique the
  header's own CSS-only mobile menu already uses, and for the same reason: exactly one
  copy is ever `display: block` at a given width, so a screen reader is never offered two
  "Documentation" navigations at once.
  
  `prose.ts` promotes a rich-text paragraph whose only content is a single `code`-marked
  span (the one "code block" shape contract A's frozen rich-text schema can express) to a
  real `<pre><code>` — the only theme-side post-processing of `@cogenta/theme-kit`'s own
  `renderRichText` output, and the reason this theme's doc pages have honest, readable
  code samples rather than an inline `<code>` wrapped in a paragraph.
  
  `collectionList` also gains a second shape for the home page's "All guides" index: on
  the `doc_page` collection specifically, entries are grouped by section (alphabetical) and
  ordered by their own `order` field, rendered as a compact multi-column table of contents
  rather than the general row list (which shows `entryImage` — `theme@1.4` — when the
  entry carries one, alongside every other collection).
  
  ≥150 tests: 17 block suites, the shared design-system/isolation/font-display/tokens/page/
  chrome/chrome-brand/theme-block-variant/theme-block-fallback/term-archive suites (the same
  discipline every L23/L25 theme carries), and a doc-page-specific suite covering the
  sidebar's grouping, current-page highlight, breadcrumb and the code-block promotion.
  Zero client JavaScript, zero literal colour (test), WCAG AA computed in both schemes, no
  new npm dependency.

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
