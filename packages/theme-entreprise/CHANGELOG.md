# @cogenta/theme-entreprise

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.2
  - @cogenta/render@0.3.4
  - @cogenta/theme-kit@0.5.2

## 1.3.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.1
  - @cogenta/render@0.3.3
  - @cogenta/theme-kit@0.5.1

## 1.3.0

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

## 1.2.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/theme-kit@0.4.1

## 1.2.0

### Minor Changes

- [`9102637`](https://github.com/cogenta-cms/cogenta/commit/9102637f2cf5933894729bd70d4b6af06b30ce80) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The Entreprise theme is redesigned for a management consultancy or any firm
  that sells judgement: an editorial twelve-column grid, Newsreader for titles
  and Hanken Grotesk for text, hairlines instead of boxes and shadows, and one
  deep green accent spent sparingly.
  
  What a site owner will see:
  
  - A typographic hero: a small-capital line under a short rule, a large serif
    title, then the introduction and actions beside a frankly cropped photograph.
  - `featureGrid` becomes a numbered list of practices (01, 02…) between
    hairlines, with its title held in the left columns. Icons are no longer drawn.
  - `stats` sets key figures in one row between vertical rules; `statCounter`
    sets them as a ruled table beside its title.
  - `collectionList` in the `list` layout shows alternating image and text rows
    (a case-study register); `grid` is a three-column editorial index; an entry
    without a picture becomes a typographic row rather than a card with a gap.
  - `testimonial` is a large serif pull quote with a small black-and-white
    portrait; `quote` is a quieter italic quotation in the reading column.
  - `faq` keeps its title in view on the left while the questions scroll on the
    right; `accordion` numbers its steps across the full width.
  - `cta` is an ink band across the page; in dark mode it becomes a raised ink
    surface between hairlines.
  - `logoStrip` and `logos` show client marks in greyscale (lifted in dark mode);
    `logos` is a ruled register whose column count fills whole rows.
  - `prose` is a reading column whose second-level headings hang in the left
    margin on wide screens.
  - The footer is a colophon: name and tagline, footer links, the footer note
    set as blocks (separate office addresses with blank lines and each first
    line becomes a label), social icons, and a `© year name` legal line.
  - Reading time is shown on an entry only when it is three minutes or more.
  - The dark palette is redesigned on deep ink surfaces with ivory text.
  
  Your content is unchanged; every block keeps its contract. A site whose skin
  still names the previous fonts (Archivo, Source Serif 4) keeps them until the
  skin is updated: the theme's own `tokens.json` now names Newsreader and Hanken
  Grotesk. Nothing moves or fades in on scroll any more, and no stylesheet uses
  `animation-timeline`.

- The entreprise theme now declares its widget areas (`theme@1.6`) and sets them in its own register: beside a case study, a practice, a sector archive or search results, the side column sits on the page's own gutters with each widget opening on an ink rule and a small-capitals label, work titles in the display serif, counts in tabular figures, and the call to discuss a mandate as the theme's one dark plane; under the text, selected work reads as an exhibit of three. The reading column keeps its hanging headings on a wide screen and stacks them above the text when narrower, the sidebar stacks under the content on mobile, footer widget columns are placed inside the theme's own footer, and rules that read a direct child of `<main>` still apply inside the sidebar layout. The search results page also gets its excerpts in the text face and a dark-aware result count. The `vitrine` blueprint seeds the widgets such a firm would have: sectors with counts, other case studies and the mandate call beside a case study, the other practices and a partner's contact details beside a practice with selected work under it, and a search box and sectors on a sector archive, never on the home page or the site's own pages.

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

- [`c87bdf8`](https://github.com/cogenta-cms/cogenta/commit/c87bdf8b0f54b945c1c79ea5a18d58b54cb9aab5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, styled as `.cg-theme-toggle` in this theme's own forest-green, KPI-section register.

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
- 4f74c57: L25 "templates pro" pass: raises `theme-entreprise` to the level of the five
  new L25 themes without changing its identity (forest green, structured B2B,
  hairline-first elevation).
  
  Chrome now uses all of contract D `theme@1.4`: a real desktop `<nav>` plus a
  CSS-only mobile menu (a visually-hidden checkbox and a three-bar `<label>`,
  no client JavaScript), `headerAction` rendered as a filled button — replacing
  the previous "last header link doubles as the call to action" convention,
  which a real `headerAction` field makes dishonest — and a genuine four-column
  footer (brand + `tagline`, footer nav, `social` via `renderSocialLinks`, and
  `footerNote` beside the Cogenta credit).
  
  `featureGrid` ("our services") is rebuilt from numbered ledger rows into a
  card grid, each card led by a real inline glyph (`renderIcon`) inside a flat,
  accent-tinted square, capped at three columns on a wide screen.
  `collectionList` is rebuilt from a ledger row into a card with a 16:9 cover
  (`entryImage`, lazy-loaded, `object-fit: cover`) above the title and excerpt.
  `stats` and `cta` are now genuine full-width flat accent bands rather than
  cards sitting in the page column. `logoStrip` reads as a tinted trust band.
  The hero's media frame gains a soft shadow alongside its existing hairline
  border. `renderPage` now draws `renderEntryHeader` (`theme@1.4`) for a routed
  entry with no `hero` of its own (a `service` page), with a matching
  `.cg-entry-header` stylesheet section. Zero gradients, zero decorative blur
  (D5) — unchanged, verified by the existing isolation test. 260 unit tests
  (up from 256).

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
