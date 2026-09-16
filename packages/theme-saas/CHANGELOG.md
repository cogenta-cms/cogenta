# @cogenta/theme-saas

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/theme-kit@0.4.1

## 0.4.0

### Minor Changes

- [`36bd4c4`](https://github.com/cogenta-cms/cogenta/commit/36bd4c44694a299ac0963327e6ff185cc7a66d1a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The SaaS theme is redesigned for a serious piece of business software: white
  and a structured grey scale, a near-black ink and one signal blue kept for
  links, focus and the primary button, with Geist for everything a visitor reads
  and Geist Mono for what software prints (eyebrows, dates in an index, units,
  step numbers, the label of a recommended plan).
  
  What changes on a site:
  
  - The hero is left-aligned: a short title set large, the subtitle and the
    actions under it, then the product screenshot across the twelve columns in
    a single hairline frame. The mesh background, the badge, the offset shapes
    and the glows are gone. On a phone the screenshot is cropped to a readable
    part of the interface.
  - `featureGrid` has two readings chosen from its data: with icons, a grid of
    three columns with a small stroke icon beside each title and no tiles; with
    no icons, a numbered sequence of steps hanging from hairlines.
  - `pricingTable` becomes a ruled comparison. Feature lines written as
    `Label: value` become rows with one value per plan, and plain lines become
    rows checked where a plan lists them. Plans that cannot be compared are
    shown as ruled columns with their own lists. The recommended plan is marked
    with a "Recommended" label and a rule in ink, never a tinted card. On a
    phone the table scrolls sideways inside its own region.
  - A `collectionList` in the `list` layout becomes a product tour (screenshot
    and words, alternating sides) when its entries have pictures, and a ruled
    index with the date in Geist Mono when they do not, as a changelog prints
    it. The `grid` and `carousel` layouts are columns without cards.
  - `stats` is a ruled row of figures with their units, `statCounter` a ruled
    strip, `testimonial` one customer's words with a framed portrait, `faq` two
    columns of open answers, `accordion` ruled rows, `logoStrip` a caption above
    wordmarks set at one height and greyed (inverted in the dark), and `cta` a
    sober close under a hairline. A page without a hero opens on its title, the
    entry's date and summary, and its screenshot.
  - The header is a sticky bar on the page's own ground under a hairline, with
    the header action as the one filled button and a CSS-only mobile menu. The
    footer is organised in columns: an unlinked item (`submenu-placeholder`) in
    the footer menu starts a column and names it.
  - The dark palette is designed: a near-black ground taken from the ink,
    lightness steps for bands and panels, a lifted blue, and screenshots dimmed
    slightly. No shadow, gradient, blur, pill or scroll animation remains;
    transitions are capped at 150 ms.
  
  Class names are new throughout (`cs-` prefix), so custom CSS written against
  the previous markup needs updating. An existing site keeps the fonts and
  colours of its current skin until that skin is updated: the theme reads both
  from the skin, so copy this theme's `tokens.json` into the site's
  `theme.tokens.json` (or set the skin's sans to Geist and its mono to Geist
  Mono) to get the new typography and palette.

- The saas theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its footer on the same twelve columns, and styles the host's `cg-sidebar-layout` as a quiet side column beside changelog entries, feature pages, archives and search results, parted from the content by a hairline, with small semibold labels, dates and counts in Geist Mono, the column search as a hairline control and the call to action as the theme's one primary button; on a phone the column stacks under the content on the page's own gutters. Blocks inside the content column keep the page edges and a full reading measure, and the search page title keeps its style there. The saas blueprint seeds that column: a search box, the changelog by month, recently shipped releases, resource links and a demo call to action, each shown only where the page does not already list the same thing.

### Patch Changes

- Widget areas on the public site (L30). `cogenta serve` resolves the widgets of every page it renders (entries, term and date archives, search, forms), decides their visibility for the real request, reads their data through the permission-checked gateway, and either hands them to a theme that places them itself (`widgetAreas` export, contract D `theme@1.6`) or places them around the theme's output. It mounts `/api/widgets`, serves date archives at `/archive/{collection}/{year}/{month}`, follows widget dropdowns through `/_cogenta/go` (same-site paths only), includes widgets in backups and clears them on a sample-data reset. Headings of running text now carry an `id`, so a table of contents can link to them.
- Updated dependencies [`58630a9`, [`bea9ead`](https://github.com/cogenta-cms/cogenta/commit/bea9eadcae2d5d49e3272eeb2437d135ee012c37), [`cbfcc6d`](https://github.com/cogenta-cms/cogenta/commit/cbfcc6d9f36e18813d40a2a9bee41c3bb34e34bb), [`e5126ed`](https://github.com/cogenta-cms/cogenta/commit/e5126ed095b7ea326d765f86b3620935fd5670d9), `41d2036`]:
  - @cogenta/theme-kit@0.4.0
  - @cogenta/render@0.3.0
  - @cogenta/blocks@1.0.5

## 0.3.3

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.4
  - @cogenta/render@0.2.4
  - @cogenta/theme-kit@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.3
  - @cogenta/render@0.2.3
  - @cogenta/theme-kit@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.2
  - @cogenta/render@0.2.2
  - @cogenta/theme-kit@0.3.1

## 0.3.0

### Minor Changes

- [`98f54ab`](https://github.com/cogenta-cms/cogenta/commit/98f54ab9883d492890251ef7fc3310c83e8fac8b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the new `renderThemeToggle` into the header, styled as `.cg-theme-toggle` in this theme's own pill/border register. Every page now offers a manual light/dark/system control; the CSS to support it already existed.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0
  - @cogenta/blocks@1.0.1
  - @cogenta/render@0.2.1

## 0.2.0

### Minor Changes

- 39d4be1: New theme package (L25, "templates pro"): a Linear/Stripe/Vercel-inspired
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
- 68f5485: A public page whose collection opted out of comments, and that holds none, no longer ends
  on a "Comments (0) — comments are closed" section: closed and empty means there is no
  discussion on this page, not a discussion the visitor may not join. A closed thread that
  already holds approved comments still shows them read-only. `@cogenta/theme-saas` caps its
  feature grid at three columns so six features read as a 3×2 grid rather than four plus
  two orphans.
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
