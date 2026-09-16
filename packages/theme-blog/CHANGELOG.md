# @cogenta/theme-blog

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.1
  - @cogenta/render@0.3.3
  - @cogenta/theme-kit@0.5.1

## 0.5.0

### Minor Changes

- A block a plugin provides is rendered on the page
  
  Contract D grows one optional field, `RenderContext.blockNodes` (`theme@1.7`):
  markup the host already produced, keyed by the block's contract B `_key`. A
  theme honours it with one line — `providedBlockNode(block, ctx)` — and a theme
  that does not is not broken: it renders the block's declared fallback, which
  is the degradation contract B has promised since L3. The ten themes in this
  repository honour it.
  
  `cogenta serve` runs a plugin's `onRenderBlock` handler in the
  permission-restricted child process, with exactly the capabilities that plugin
  was granted, and checks the tree it returns against a tag and attribute
  allowlist before it reaches a page: no `script`, no `on*`, no `javascript:`,
  bounded depth, node count and text. A plugin that throws, times out or returns
  something else degrades to its fallback — the page is never defaced and never
  emptied.
  
  Rendered trees are cached against the plugin, its version, the block type, the
  stored values and the locale, so a block is not a forked process per visit.
  `PluginRuntime` gains `invokeHandler`, so this runs under the same concurrency
  ceiling, grants and disable-on-violation policy as a plugin route.

### Patch Changes

- Updated dependencies [`6a2b8c4`, `860bb0d`, `6fc014e`]:
  - @cogenta/blocks@1.1.0
  - @cogenta/theme-kit@0.5.0
  - @cogenta/render@0.3.2

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/theme-kit@0.4.1

## 0.4.0

### Minor Changes

- [`e0639e3`](https://github.com/cogenta-cms/cogenta/commit/e0639e35c80f7f2d2731baab02767ab9f3534148) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The Blog theme is redesigned as a personal publication made for reading:
  Literata for everything a reader reads (titles, essays, standfirsts,
  quotations, at the optical size drawn for each size) and Figtree for
  everything a reader uses (navigation, dates, labels, buttons), on a warm paper
  with a warm near-black ink and one ink-blue accent kept for links.
  
  What changes on a site:
  
  - The page is a twelve-column grid with a margin: dates, years, labels and
    attributions sit in the first three columns, and every block starts its text
    on the same line.
  - A `collectionList` in the `list` layout becomes an editorial index: the date
    in the margin, the year once at the head of each year, the title and
    standfirst, and a picture only for the entries that have one. The `grid` and
    `carousel` layouts become a ruled shelf. A taxonomy archive uses the same
    index.
  - An entry with a date, a standfirst, a cover or terms is set as an essay: the
    topic, date and reading time in the margin beside a large title, the cover
    at 3:2, a 68-character reading column with pull quotes, captioned figures
    and a small-capitals `h4` for notes, and the terms it is filed under at the
    end. A reading time under two minutes is no longer shown.
  - `featureGrid` is drawn as a table of contents without icons, `cta` as an
    invitation between two rules, `faq` with its title held in the margin, and
    the other blocks in the same register. Comments get baseline form fields.
  - The header no longer sticks to the top of the window, its call to action is
    an outlined control, and the mobile menu is a CSS-only panel. The footer is
    a short colophon with the copyright year and real social icons.
  - The dark palette is redesigned on warm ink surfaces, and photographs are
    dimmed slightly on ink. No shadow, gradient, pill or scroll animation
    remains; transitions are capped at 150 ms.
  
  Class names are new throughout, so custom CSS written against the previous
  markup needs updating. An existing site keeps the fonts and colours of its
  current skin until that skin is updated: the theme reads both from the skin,
  so copy this theme's `tokens.json` into the site's `theme.tokens.json` (or set
  the skin's serif to Literata and its sans to Figtree) to get the new
  typography and palette.

- The blog theme now sets widget areas in its own register (contract D `theme@1.6`): it declares `widgetAreas`, so footer widget columns sit inside its colophon between the navigation and the legal line, and a new `widgets.css` puts the host's sidebar layout on the theme's twelve-column grid. On a wide screen the content keeps nine columns, so the margin and the text line stay exactly where they are on every other page, and the sidebar takes the last three; below that width the sidebar follows the content in as many columns as fit. Widgets use the theme's own type (small-capital labels on an ink rule, titles in the text face, hairlines between rows, fields drawn as baselines), and related entries after an essay are set like the index, with the date in the margin. The `blog` blueprint now seeds a sidebar (about, search, recent posts, subjects with counts, tags, posts by year) on posts, subject and tag archives, date archives and search results, plus a "Further reading" list under each post.

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

- [`74b05dc`](https://github.com/cogenta-cms/cogenta/commit/74b05dc34d5dcaac3c87c92a7735246e3c68aaa2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, after both the desktop and mobile nav. Fix a real layout bug found while verifying it: `.cg-prose` (the reading column every article and static page uses) never cleared a preceding floated `mediaFigure` (e.g. an "About" page's aligned author photo), so the auto-centered column could wrap unpredictably beside the float instead of starting clear below it.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0
  - @cogenta/blocks@1.0.1
  - @cogenta/render@0.2.1

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
