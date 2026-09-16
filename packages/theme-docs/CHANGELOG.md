# @cogenta/theme-docs

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/theme-kit@0.4.1

## 0.4.0

### Minor Changes

- [`205e165`](https://github.com/cogenta-cms/cogenta/commit/205e165e5b8b2a64564bc6f35d344eb8d7d95496) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The documentation theme is redesigned for first-class technical documentation:
  white and a cool grey scale, a near-black ink and one deep petrol teal kept for
  links, the page being read and focus, with IBM Plex Sans for everything a reader
  reads and IBM Plex Mono for code.
  
  What changes on a site:
  
  - **A documentation page** has three columns on a wide screen: the navigation,
    held in view as the page scrolls and grouped by section with the current page
    marked; the article, with a breadcrumb, the title, the entry's summary under
    it, and the date the page last changed; and "On this page", built from the
    article's own headings. The table of contents goes below 80rem, and below
    64rem the navigation folds into a disclosure at the top of the article that
    names the current section and page. Previous and next links at the bottom
    follow the documentation's reading order. The navigation now orders sections
    by the smallest `order` they hold, so a section never jumps when two pages
    were created in the same millisecond.
  - **Running text** reads four shapes an editor can already write, and renders
    them as documentation furniture. Every other theme keeps rendering the same
    data as ordinary paragraphs and lists:
    - a paragraph whose spans are all marked `code` is a code block; when its
      first span is also bold, that span is the block's label (a file name, or
      "Terminal"). Long lines scroll inside the block, comment lines are set as
      comments, and in a shell example the `$ ` prompt cannot be selected and
      program output is set apart;
    - a blockquote opening on a bold "Note", "Tip", "Important", "Warning" or
      "Caution" is a note (teal rule for notes and tips, ink rule otherwise);
    - a bulleted list whose items all open on a span marked only `code` is a
      reference table: the term, an optional italic type or default, and the
      description, aligned in columns between hairlines;
    - inline code holding a key or a key chord (`Ctrl+C`) is set as keys.
    `h2` and `h3` headings get an id and link to themselves.
  - **The home page hero** carries a large search field: a real `GET /search`
    form, no script. The header carries a compact one, the top sections, and on a
    phone a search link and a menu that opens without a script.
  - `featureGrid` is short entries hanging from hairlines in up to four columns,
    without icon tiles; a `collectionList` of `doc_page` entries is the whole
    documentation in one column per section; other lists are ruled indexes or
    columns of framed pictures. `faq` answers in the open beside its title,
    `accordion` is ruled rows, `stats` and `statCounter` ruled figures in tabular
    numerals, `pricingTable` plans side by side between hairlines, `cta` a close
    between two rules, and `quote`/`testimonial` a quotation hanging from an ink
    rule.
  - The footer is organised in columns: an unlinked item
    (`submenu-placeholder`) in the footer menu starts a column and names it. The
    legal line prints the copyright year and the product's name.
  - The dark palette is designed for reading code: a cool near-black ground, code
    raised a step above it, soft white text and a lifted teal; diagrams are
    dimmed slightly. No shadow, gradient, blur, pill or scroll animation remains,
    and the search results and term archive pages align with the rest of the site.
  
  Class names are new throughout (`cd-` prefix), so custom CSS written against the
  previous markup needs updating. An existing site keeps the fonts and colours of
  its current skin until that skin is updated: the theme reads both from the skin,
  so copy this theme's `tokens.json` into the site's `theme.tokens.json` (or set
  the skin's sans to IBM Plex Sans and its mono to IBM Plex Mono) to get the new
  typography and palette.

- The documentation theme now declares its widget areas and sets them in its own register. On a documentation page the sidebar becomes the right-hand rail it shares with "On this page": the contents stay in view while the page is read and the widgets sit at the foot of the rail, level with the end of the article, so the docs grid never gains a fourth column; a page with no contents gives the rail to the widgets, between 64rem and 80rem they close the article's column, and on a phone they follow the page. Beside search results and archives the same rail sits at the page's right edge. Footer widget columns are placed inside the theme's footer, above the legal line, and search result summaries take the theme's muted ink in dark mode. The documentation blueprint seeds a "Need help?" list and the 2.4 upgrade note on doc pages, and a "Popular pages" list beside search results.

### Patch Changes

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

- [`80ae76d`](https://github.com/cogenta-cms/cogenta/commit/80ae76db6578f34d3292a088b857dcf14c8acf31) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, styled to this theme's own icon-button register. Fix a real mobile bug found while verifying it: the header's desktop call-to-action button stayed visible below the 56rem breakpoint because the shared `.cg-action { display: inline-flex }` rule was declared later in the stylesheet than the mobile "hide" rule for `.cg-site-header__action`, winning the cascade tie — this squeezed the site name into wrapping onto a second line that visually overlapped the page content beneath the sticky header. The hide rule now chains the parent class to outrank `.cg-action` regardless of source order, and the site name gets `white-space: nowrap`/`flex-shrink: 0` as a second line of defence.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0
  - @cogenta/blocks@1.0.1
  - @cogenta/render@0.2.1

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
