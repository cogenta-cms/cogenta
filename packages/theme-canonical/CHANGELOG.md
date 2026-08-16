# @cogenta/theme-canonical

## 0.2.0

### Minor Changes

- [`32f5db9`](https://github.com/cogenta-cms/cogenta/commit/32f5db932454aa35e586a4ffe144f909b0b773af) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Carry each placed block's identity into the rendered HTML, so a reader of the page can map
  a rendered element back to the block that produced it.
  
  Two data attributes, both written on every render rather than in a builder-only mode:
  
  - `data-block-key` — contract B's `_key` for the placed block, stamped by `renderPage`
    onto whatever element the block rendered to. It is written in one place, so no block
    renderer has to remember it.
  - `data-field` — written by a block renderer on the single element that carries one
    plain-text field's whole value (`hero`'s `title`, `quote`'s `author`, `cta`'s `text`, …).
  
  No element changed shape to get either one: the block snapshots differ by exactly these
  attributes and nothing else, so the outline, the styling and the layout are unchanged. Rich
  text and repeated list items deliberately carry no `data-field` — a document and a list are
  not a text node, and claiming they were would let a caller write a value it cannot address
  back.
  
  This is what makes the visual page builder (L16) able to show the real server-rendered page
  rather than a React approximation of it: one render path, one output, and the builder's
  fidelity test can assert byte equality instead of "close enough".

- [`e321f08`](https://github.com/cogenta-cms/cogenta/commit/e321f089b14f5f116f28ab6eb2d2ffc0a43bc27d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give the canonical theme a real design system, and make `cogenta serve` actually send it.
  
  `src/styles/theme.css` is now three layers — `tokens.css` (the design system),
  `base.css` (document, accessibility, page frame, actions) and `blocks.css` (the twelve
  vocabulary blocks). Every value in all three is still derived from contract D's closed
  skin token set: spacing from `--cogenta-space-unit` and `--cogenta-space-scale`, type from
  the seven `--cogenta-font-size-*` steps `renderSkin` emits, colour from the seven colour
  tokens through `color-mix()` and relative `oklch()`. No token was added to the contract and
  no colour literal was added to the theme.
  
  **Two real bugs fixed on the way.** The stylesheet referenced `--cogenta-color-accentFg`,
  `--cogenta-color-mutedFg` and `--cogenta-font-baseSize`, but `renderSkin` kebab-cases token
  names, so the real properties are `--cogenta-color-accent-fg`, `--cogenta-color-muted-fg`
  and `--cogenta-font-base-size`. Every muted text colour, every primary button label and the
  entire typographic scale therefore resolved to nothing. A new test derives the expected
  property names from the skin and fails on any future misspelling.
  
  And `cogenta serve` sent the skin's generated custom properties but never the stylesheet
  that uses them, so every served page was styled by the browser's defaults with a skin
  defined and unused. It now inlines the theme's sheet — `@import`s flattened, comments
  dropped, whitespace squeezed — next to the skin's, and renders the same page frame
  `Base.astro` builds: a skip link, a site header with a home link, and a footer.
  
  **Dark mode, designed rather than inverted.** A `light-dark()` palette behind an
  `@supports` guard, with `color-scheme` declared so native controls follow. Elevation is
  expressed as lightness rather than shadow, the accent is lifted and its foreground
  consequently flipped to ink, borders become lighter overlays, and text stays off pure
  white. `design-system.test.ts` computes every one of those colours from the real stylesheet
  — resolving `var()`, `light-dark()`, `color-mix(in oklab, …)` and `oklch(from …)` — and
  asserts AA body contrast on fourteen pairs in both schemes.
  
  `Site.skinCss` is now `Site.styles`, and `assembleSite`'s last parameter with it.

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@0.1.2

## 0.1.0

### Minor Changes

- [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the rendering layer: `@cogenta/render`, `@cogenta/theme-canonical` and `@cogenta/seo`.
  
  A theme reads content through an HTTP client carrying a read-only token, never through
  the data layer (ADR-0016), and the isolation is checked at install rather than documented
  and hoped for. A hostile-theme fixture proves the refusal against every route in: a bare
  `fs` alias, a subpath import, a template-literal dynamic import, `createRequire`, an
  import inside a `<script>`, and a `node:fs` alias smuggled through `package.json`
  `imports`. The inverse guard matters as much — a theme whose prose contains `don't`, a
  class named `process` and a commented-out import yields zero findings.
  
  The canonical theme implements the twelve blocks with no JavaScript at all, asserted:
  no script tag, no `on*` attribute, no `client:*` directive. Heading levels are read from
  the block vocabulary rather than restated, so a titleless `featureGrid` keeps its items
  at `h2` and no level is skipped. `consentRequired` suppresses even the provider
  thumbnail, because a thumbnail already leaks the visitor's IP.
  
  Skins validate as hard refusals: AA contrast on every declared pair with no epsilon on
  the threshold, a monotonic type scale, no missing and no unknown token, and
  `prefers-reduced-motion` honoured. A token value containing CSS syntax is refused — a
  skin is a shareable JSON file interpolated into a stylesheet, and without that check it
  is code rather than data.
  
  SEO derives JSON-LD from the schema, keeps `hreflang` reciprocal by construction, and
  blocks indexing on the working state as well as on draft status: a feed rendered from
  the working face ships unreviewed edits, which is the same leak as a draft and far
  harder to notice.

### Patch Changes

- Updated dependencies [[`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/blocks@0.1.0
