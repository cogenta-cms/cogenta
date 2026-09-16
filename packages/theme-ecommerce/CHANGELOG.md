# @cogenta/theme-ecommerce

## 1.2.0

### Minor Changes

- [`b8ad25e`](https://github.com/cogenta-cms/cogenta/commit/b8ad25e6310470928db7291c2bb818bf91eb727e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The E-commerce theme is redesigned for a small brand of durable everyday
  goods. Albert Sans sets everything, light and large for headlines, regular for
  text, medium for names and prices. The page is sand and warm ink, with a stone
  band for the footer and one terracotta kept for focus rings, text selection and
  the underline of links in running text. Corners are square, and structure is
  drawn with space and hairlines.
  
  What changes on a site:
  
  - The header is one row under a hairline, held at the top of the window: the
    shop's name or logo, the navigation in words and the header action as an
    underlined link. There is no cart, search or account control. On a phone the
    navigation opens as a CSS-only full-height panel of large links. The footer
    is a stone band with the name, tagline and address note, the footer menu,
    social profiles with their names, and the copyright line.
  - A `hero` sets its headline on the grid, with the subtitle and one action
    beside it, and the photograph across the whole window underneath. Text is
    never laid over the picture.
  - A `collectionList` whose entries all carry a numeric `price` is a product
    grid: photographs at 4:5, four across on a wide screen and two on a phone,
    the name and the price under each in tabular figures, and "Sold out" as a
    plain line of text when `inStock` is false. Entries with a picture and no
    price (categories, for example) are square tiles named by an arrow link;
    anything else is a ruled index. A list never shows the page it is on.
  - A product page now uses contract D `theme@1.5` fields: the photograph on
    seven columns, and beside it, held in view, the category, name, price, stock
    status, short description, an order action, a delivery note and the details
    (`material`, `dimensions`, `weight`, `capacity`, `origin`, `care`). The theme
    draws no "Add to cart". The action comes from the entry's `orderLink`: an
    email address reads "Order by email" (or "Ask about the next batch" when sold
    out), any other link "Order this piece", and `orderLabel` overrides the
    wording. Prices use the entry's `currency` code and fall back to euros. A host
    older than `theme@1.5` gets a plain page header instead.
  - `featureGrid` items without a sentence become one ruled line of statements
    (delivery, returns, repairs); with sentences they are ruled columns with a
    small line icon and no tile. `mediaFigure` aligned `start` or `end` is a
    split of photograph and caption, `cta` a line under an ink rule, `faq` and
    `accordion` details rows beside a held title, `quote` and `testimonial` words
    set large and light with a hanging opening mark, `stats` and `statCounter`
    figures under hairlines, `pricingTable` ruled columns, `logos` and
    `logoStrip` marks along one row, `gallery` squares, masonry or a scrolling
    row, `embed` a frame that contacts no third party before consent.
  - Page headers show the title, and an entry's summary beside it. Date, author
    and reading time appear only for dated entries.
  - The dark palette is a deep warm brown-black with sand type and a lifted
    terracotta; photographs are dimmed slightly. No gradient, shadow, hover lift,
    keyframe or scroll-driven animation remains, and transitions are capped at
    150 ms.
  
  Class names are new throughout, so custom CSS written against the previous
  markup needs updating. An existing site keeps the fonts and colours of its
  current skin until that skin is updated: the theme reads its typeface and
  palette from the skin, so copy this theme's `tokens.json` into the site's
  `theme.tokens.json` (or set the skin's sans to Albert Sans and its accent to
  `#9a4a2e`) to get the new typography and palette.

- The shop theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its stone footer as a tier under a hairline, each column starting on a column of the row above, and styles the host's `cg-sidebar-layout` the way a product sheet sets its details: a caption label, ruled rows of words, a product's photograph at 4:5 on the plate, a call to action as the theme's arrow link and a search button as underlined words, so the one filled ink rectangle stays with the page's own action. Beside the column a page title stacks over its lead, running text and questions take the column at the reading measure, goods go three across and a product's photograph and sheet share the column; on a phone and a tablet the column follows the page. A strip of entries with photographs before or after the content lines up with the goods grid. Host-rendered page titles keep their style inside the content column, and search excerpts and counts follow the dark palette. The store blueprint seeds a customer care list and a contact prompt beside the ordering, delivery, repairs, contact and terms pages, the newest pieces beside search results, and in the footer the shop's telephone and the letters from the workshop, each hidden where the page already says the same; the contact page now names the letters' address.

### Patch Changes

- Widget areas on the public site (L30). `cogenta serve` resolves the widgets of every page it renders (entries, term and date archives, search, forms), decides their visibility for the real request, reads their data through the permission-checked gateway, and either hands them to a theme that places them itself (`widgetAreas` export, contract D `theme@1.6`) or places them around the theme's output. It mounts `/api/widgets`, serves date archives at `/archive/{collection}/{year}/{month}`, follows widget dropdowns through `/_cogenta/go` (same-site paths only), includes widgets in backups and clears them on a sample-data reset. Headings of running text now carry an `id`, so a table of contents can link to them.
- Updated dependencies [`58630a9`, [`bea9ead`](https://github.com/cogenta-cms/cogenta/commit/bea9eadcae2d5d49e3272eeb2437d135ee012c37), [`cbfcc6d`](https://github.com/cogenta-cms/cogenta/commit/cbfcc6d9f36e18813d40a2a9bee41c3bb34e34bb), [`e5126ed`](https://github.com/cogenta-cms/cogenta/commit/e5126ed095b7ea326d765f86b3620935fd5670d9), `41d2036`]:
  - @cogenta/theme-kit@0.4.0
  - @cogenta/render@0.3.0
  - @cogenta/blocks@1.0.5

## 1.1.3

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.4
  - @cogenta/render@0.2.4
  - @cogenta/theme-kit@0.3.3

## 1.1.2

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.3
  - @cogenta/render@0.2.3
  - @cogenta/theme-kit@0.3.2

## 1.1.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.2
  - @cogenta/render@0.2.2
  - @cogenta/theme-kit@0.3.1

## 1.1.0

### Minor Changes

- [`ccd5dd3`](https://github.com/cogenta-cms/cogenta/commit/ccd5dd3e7bc148ddbfd0c6ade2c9d09df5e82b10) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, after the primary nav, inside the same header bar — it survives the CSS-only mobile collapse without needing an entry in `hasMenu`. Styled as `.cg-theme-toggle` in this theme's own magenta-accented register.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0
  - @cogenta/blocks@1.0.1
  - @cogenta/render@0.2.1

## 1.0.0

### Major Changes

- 4335296: Widen contract B (the block vocabulary) from twelve to seventeen blocks (`blocks@2.0`,
  RFC 0001 — `docs/rfc/0001-widen-block-vocabulary.md`), and add a shared, optional
  per-instance visual variant to every block's envelope (RFC 0002 —
  `docs/rfc/0002-per-block-visual-variant.md`). Both were decided in direct conversation
  with the user (fiche 43, Cogenta Page Builder), reopening ADR-0009 ("the vocabulary must
  stay small") with an explicit renouncement traced in the RFCs themselves.
  
  **New blocks**: `testimonial`, `pricingTable`, `accordion`, `statCounter`, `logoStrip`.
  Each names a `fallback` into the twelve of `blocks@1.0` (`prose`, `featureGrid`,
  `mediaFigure`), so a theme built before this version still renders them — degraded, never
  lost — via `BlockRegistry.resolveRenderable`, now actually wired into the render path
  (`@cogenta/theme-kit`'s new `resolveBlockForRender`). All five in-house themes implement
  all five directly with their own distinct markup and CSS (never a recolour of another
  theme's), so this degraded path is a safety net for a third-party theme, not something a
  site using a built-in theme ever sees in practice.
  
  **Why major, not the "adding a block is minor" default this contract stated at
  `blocks@1.0`**: every theme's `renderBlock` is an exhaustive `switch` over
  `VocabularyBlock`, `never`-checked at compile time by design — a block added to the
  vocabulary is therefore a real breaking change for every existing theme's build, even
  though no content anyone has ever saved is affected (nothing could create these block
  types before this version). `docs/04-contrats.md` is updated to record this as the
  precedent for this specific category of change, decided case by case per RFC rather than
  by a blanket rule.
  
  **`variant`** (RFC 0002): an optional `{ background?, spacing?, align?, width? }` on
  every placed block's envelope — semantic tokens, never CSS or a colour (rule R3 holds).
  Applied once per theme, in `renderBlock` itself via `@cogenta/theme-kit`'s
  `withBlockVariant`, rather than by each of the seventeen block renderers individually.
  Absent on all content written before this version, and rendered byte-for-byte identical:
  purely additive at the data level, even though it ships in the same major bump as the
  vocabulary widening above.
  
  Each theme resolves the four axes to its own existing design tokens
  (`[data-block][data-variant-*]` attribute selectors, `--cg-*`/`--ce-*` custom
  properties already defined by that theme) — no theme gained a background-image
  mechanism (RFC 0002 adds only the semantic token, not a media field), so
  `background: 'image'` resolves to each theme's closest tinted-surface approximation
  rather than doing nothing with a stated author intent.
  
  `@cogenta/admin`'s page builder gains a small "Appearance" control (four selects) in the
  selected block's detail panel, writing through the existing `updateBlockData` — no new
  mechanism, per the RFC's own decision.

### Minor Changes

- 722fc6b: The site's logo, dark logo, favicon and share image now reach the rendered page
  (contract D `theme@1.3`, additive).
  
  All four were writable from the admin's Appearance screen, saved, and read back —
  and read by nothing else at all. A site that uploaded its logo still served Cogenta's
  default favicon and its own name as plain text on every page.
  
  - `@cogenta/theme-kit` gains `ChromeBrand`, the optional `ChromeInput.brand`, and
    `renderBrandMark()` — one `<picture>` with a `prefers-color-scheme` source, the
    site name always written as `alt`. A theme that ignores `brand` renders exactly as
    before; nothing about `theme@1.2` changed.
  - The five built-in themes each place the mark in their own chrome (a header bar, a
    masthead nameplate, a storefront bar), never a shared template, and each keeps the
    site name in text somewhere on the page so a failed logo never leaves it unnamed.
  - `cogenta serve` resolves the four media ids live per request, through the same
    `/_image` endpoint and the same batch media loader every other image uses. A media
    that is missing, or is not an image, falls back rather than emitting a broken tag.
  
  Two decisions worth knowing:
  
  - `shareImageMediaId` is now a **source for** `seo.defaultSocialImageUrl`, not a rival
    to it: the SEO pipeline still reads one field, and the appearance screen's picker
    wins when it is set. Neither of the two competing settings is left silently dead.
  - The favicon fallback is branding-aware. Cogenta's default icon *is* Cogenta's logo,
    so a white-labelled site falls back to its own replacement logo, and to no
    `<link rel="icon">` at all when it has none — rather than getting somebody else's
    mark back in the browser tab.
- a6530f6: Taxonomy terms finally have a public page (contract D `theme@1.3`, additive).
  
  ADR-0022 shipped native taxonomies and the admin has let an editor point a menu item
  at a term ever since — and `resolveMenuTerm` answered `route: null` for every one of
  them, honestly, because no site rendered such a page. A term was a filing cabinet with
  no door.
  
  - `GET /{taxonomy}/{term-slug}` lists every published entry filed under a term, newest
    first, across every collection that classifies with it. `?page=N` paginates; page 2
    and beyond are `noindex, follow` with a canonical of their own.
  - `@cogenta/theme-kit` gains `TermArchiveInput` and `ThemeModule.renderTermArchive` —
    **optional**: a theme that does not implement it still serves the page, in its own
    chrome, through a plain host-rendered list. The five built-in themes each implement
    it with their own layout, reusing their own `collectionList` card classes so an
    archive looks like that theme's lists rather than a sixth design.
  - `resolveMenuTerm` returns a real route, so a taxonomy menu item is a link.
  - `/sitemap.xml` lists every term that has something published under it.
  
  Two decisions: the URL pattern is fixed and resolved by the host **after** every real
  collection route has failed to match — so a `/blog/:slug` route can never be shadowed,
  and a taxonomy needs no `routing` of its own (which would have been a contract A
  change ADR-0022 deliberately avoided). And a term archive lists that term only; its
  sub-terms are offered as links rather than folded in, so what the page shows always
  matches the term that was asked for.
- 70c7306: L25 "templates pro" passe pro: `@cogenta/theme-ecommerce` now consumes
  `theme@1.4` in full — a sticky header with a real desktop nav, a CSS-only
  mobile menu (checkbox + `<label>`, not `<details>`: a *closed* `<details>`
  cannot render its non-`<summary>` content at all in current Chrome, so a
  header with only ever one nav panel avoids that failure mode outright
  rather than working around it), a `headerAction` button, and a real
  four-column footer (brand + tagline, footer nav, social links via
  `renderSocialLinks`, and a fourth column carrying the footer note above
  `brandingHtml`). Every one of the four fields stays optional and additive —
  a render that sets none of them is byte-for-byte the previous chrome.
  
  The product grid (`collectionList`) now shows what a shopper actually
  compares: `entryImage` as a square photo, a formatted price
  (`Intl.NumberFormat` in the page's own locale), a flat "Out of stock" badge
  when `inStock === false`, and a category chip — all raw contract-A data,
  read by field-name convention (never a new contract requirement), so a
  collection with none of those fields still renders a correct card (image,
  title, excerpt). `featureGrid` now renders a real inline icon
  (`renderIcon`) instead of an empty decorative chip. `gallery` shows each
  item's own image `alt` text as a flat caption band when the media entity
  has one — the mechanism this theme's category tiles use, since contract
  B's `gallery` item carries no caption field of its own. A routed
  collection with no `blocks`/`richText` field of its own (this theme's
  `product`) now draws `renderEntryHeader`'s furniture (title, cover photo,
  excerpt) on its own page — `price`/`inStock`/`category` stay on the grid
  card, `PageEntryMeta` having no room for schema-specific fields.
  
  Zero gradients, zero decorative blur (D5) — everywhere.

### Patch Changes

- 684d743: L25 task A0e (D5, a binding product rule: a gradient reads as the generic
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
- a15b1ae: Theme manifest gains `description`/`author` (`theme@1.2`, additive), and the
  "Apparence" admin screen splits into a theme gallery and a "Personnaliser"
  screen reached from it (fiche 48).
  
  - `@cogenta/render`'s `ThemeManifest` gains optional `description?: string`
    and `author?: string` (`theme@1.2`). Both are optional so a manifest
    written before this version, or a third-party theme that simply omits
    them, keeps validating unchanged — the appearance gallery falls back to
    the registry's own `label` when `description` is absent, and shows no
    author line at all when `author` is absent.
  - The five built-in themes (`@cogenta/theme-canonical`, `-ecommerce`,
    `-entreprise`, `-magazine`, `-portfolio`) now declare `description` and
    `author: 'Cogenta'` in `theme.config.ts`. Patch releases: no rendering
    behaviour changed, only manifest metadata.
  - `@cogenta/api`'s `AvailableThemeLike` (and `GET /api/theme`'s
    `availableThemes`) gains `version: string` and `author: string | null`,
    read straight from each theme's manifest rather than duplicated by hand —
    editing a theme's `theme.config.ts` alone now changes what the API
    returns.
  - `@cogenta/cli`'s `theme-registry.ts` `availableThemes()` becomes
    **async** (breaking for any direct caller — it now has to load and cache
    each theme's manifest, which is an ESM dynamic import): it reads
    `label` from the registry as before, but now reads `description`,
    `version` and `author` from the theme's own manifest instead of a
    hand-duplicated string. Both call sites in `cogenta serve` were updated
    to `await` it.
  - The admin's "Apparence" screen (`packages/admin`, unpublished) is split
    into two screens: a gallery (theme preview, name, description, version,
    author, and a "Personnaliser" action on whichever theme is active) and a
    personalization screen (tokens, contrast warnings, additional CSS,
    identity, skin gallery, AI generation) — previously one dense, continuous
    screen. Purely a navigation change: every existing action still does
    exactly what it did before, just behind one more click.
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
