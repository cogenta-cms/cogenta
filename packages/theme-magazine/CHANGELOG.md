# @cogenta/theme-magazine

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

- [`91248bc`](https://github.com/cogenta-cms/cogenta/commit/91248bc57b81216e6e2b9a7d49ec4b6649eaba1b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The Magazine theme is redesigned as a serious news and culture daily: Fraunces
  for the nameplate and every headline, Source Serif 4 for the text, and Libre
  Franklin for kickers, bylines, dates, navigation and captions, on white
  newsprint in black ink with one editorial red kept for section kickers and a
  few rules.
  
  What changes on a site:
  
  - The masthead has three rows: a thin bar with today's date, the tagline, the
    header action and the light/dark control; the nameplate, centred; and the
    sections in spaced capitals between a double rule and a hairline. On a phone
    the sections open as a CSS-only full-height panel and the header action stays
    visible in the bar.
  - A page that opens on an untitled `grid` listing is set as a front page: the
    first story across eight columns with its photograph, three briefs beside it
    behind a column rule, and the next stories in a row of four divided by
    hairlines. A titled `grid` becomes a section rail, a `carousel` becomes a
    strip of columns (the opinion strip, with the columnist in the kicker), and a
    `list` becomes a numbered ranked list. Kickers come from a plain-text
    `kicker` field (or `section`/`category`/`topic` when they hold text); a
    taxonomy id is never shown.
  - An entry with a date, a standfirst, a cover or terms is set as an article:
    its section term as a red kicker linking to its front, a very large headline,
    an italic standfirst, a byline built from `author`/`authors` taxonomy terms
    (each linked to its archive) and the date between hairlines, then the lead
    photograph. When the body opens with a `mediaFigure`, that figure, with its
    caption and credit, is the lead photograph instead of the uncaptioned cover.
    The text sits in a 66-character column with display subheads, pull quotes
    hanging to its left, and a two-line drop cap where the browser supports a
    true initial letter.
  - A taxonomy archive is set as a section front in type: the term very large on
    a double rule, then the same lead, briefs and row composition.
  - `featureGrid` is a contents panel with column rules and no icons, `cta` an
    appeal between a double rule and its actions, `faq` a reader's guide set
    open, `accordion` collapsible ruled notes, `stats` figures between rules,
    `statCounter` a ruled table, `pricingTable` subscription rates as a ruled
    table, `logos` and `logoStrip` marks in one tone, `gallery` a picture spread.
  - The colophon repeats the nameplate over four dense columns and a legal line
    with the copyright year. The dark palette is designed on ink with the red
    lifted for contrast, and photographs are dimmed slightly on ink.
  - Every scroll-driven entrance animation is gone, so a full-page capture, a
    print or a crawler sees the whole page. No shadow, gradient, pill or hover
    lift remains; transitions are capped at 150 ms.
  
  Class names are new throughout, so custom CSS written against the previous
  markup needs updating. An existing site keeps the fonts and colours of its
  current skin until that skin is updated: the theme reads the display and
  interface faces and the palette from the skin, so copy this theme's
  `tokens.json` into the site's `theme.tokens.json` (or set the skin's serif to
  Fraunces and its sans to Libre Franklin) to get the new typography and palette.

- Widget areas set in the magazine's register (contract D `theme@1.6`, L30): the sidebar is a rail of labels on heavy rules beside a story, a section front or search results, with headlines in the display face and the membership pitch on a rule of editorial red; stories under an article run as a strip between column rules; the footer columns sit inside the colophon, under the name. The theme exports `widgetAreas`.

### Patch Changes

- Widget areas on the public site (L30). `cogenta serve` resolves the widgets of every page it renders (entries, term and date archives, search, forms), decides their visibility for the real request, reads their data through the permission-checked gateway, and either hands them to a theme that places them itself (`widgetAreas` export, contract D `theme@1.6`) or places them around the theme's output. It mounts `/api/widgets`, serves date archives at `/archive/{collection}/{year}/{month}`, follows widget dropdowns through `/_cogenta/go` (same-site paths only), includes widgets in backups and clears them on a sample-data reset. Headings of running text now carry an `id`, so a table of contents can link to them.

- [`5e76281`](https://github.com/cogenta-cms/cogenta/commit/5e76281d8a1f058f1220c751f408412375bfa329) Thanks [@georgesmomo](https://github.com/georgesmomo)! - A cover without a picture now spans the page, so the rule under it runs the full width like every other rule instead of stopping short at column 10.

- [`6513fc6`](https://github.com/cogenta-cms/cogenta/commit/6513fc665b7f173c266634e1a0bbe79d286719a9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Magazine sets an article, a text page and the search results on a centred reading axis instead of a column that left a third of the screen empty on the right. A page of running text (About, Standards) is no longer set as a news story because it has a reading time: no byline rule, no "min read", no drop cap. `cogenta serve`'s search page gives each result its summary and publication date plus a result count, and the search and form pages now carry the site's tagline, social links and footer note like every other public page.

- [`3d785c2`](https://github.com/cogenta-cms/cogenta/commit/3d785c2bb044a397aab259d12ec301f913a3bb1e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The search results page sets its result count inside the title, so it lands wherever a theme places the title, and carries a zero-specificity floor stylesheet (skin tokens only) so a theme that does not style the summary, date or page width still shows a readable page instead of a title against the window edge.
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

- [`bb04899`](https://github.com/cogenta-cms/cogenta/commit/bb04899e5f4d041efcf9c6a4ceaf3033fe897415) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the masthead's top strip, next to today's date — the one row that renders on every page regardless of whether the rubric row below it carries a nav or a header action. Styled as `.cg-theme-toggle` in this theme's own warm-paper register (outlined icon button, not the underlined `.cg-action` link style).

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
- 795ad62: Pro pass on the magazine theme (L25): a structured, flat "front page" redesign that keeps
  the Fraunces + Public Sans identity, built on `theme@1.4`.
  
  Masthead: the top strip now names today's date (`Intl.DateTimeFormat(locale, { dateStyle:
  'full' })`) instead of a static tagline; a quiet rubric row carries the site's own nav plus
  `headerAction` as a filled button; a CSS-only `<details>` disclosure collapses the rubric
  into a hamburger below `56rem`, with a real, always-native `<nav>` shown in its place above
  it (never one `<details>` forced open at width — a closed `<details>`'s non-summary content
  cannot be laid out by an author `display` override in a real browser). The colophon is now a
  dense four-column footer: brand + tagline, a section index, social icons (`renderSocialLinks`),
  and a closing note with the branding fragment.
  
  `collectionList`'s three layouts are now genuinely distinct: `grid` ("Top stories") gives its
  first entry a full-width lead — 16:9 cover, section eyebrow, headline, full excerpt — followed
  by the rest as a 3-column card grid (cover, eyebrow, title, date); `list` is a rubric rail of
  compact rows with a small thumbnail when the entry has a cover image, a numbered index
  otherwise; `carousel` stays a horizontal-scroll row of uniform, image-led frames. A card's
  section eyebrow is read from the entry's own `section`/`category`/`topic`/`department` field —
  the same "usual field name, never invented" convention `entryImage`/`entryExcerpt` already
  follow, extended locally since contract D's `PageEntryMeta.terms` only resolves taxonomy
  classifications, never an arbitrary `select` field.
  
  An article page now renders `renderEntryHeader`'s furniture (classification eyebrow styled in
  the masthead's own journal-red accent, a big serif headline, a dek, an editorial meta line
  between two hairlines, and a full-bleed 16:9 cover) instead of the bare title every other page
  falls back to.
  
  Also fixes a real bug from the theme's original L23 build: `src/index.ts` never re-exported
  five of its seventeen block renderers (`accordion`, `logo-strip`, `pricing-table`,
  `stat-counter`, `testimonial`) — a consumer importing them from the package root got a
  type error the theme's own tests never caught, since every internal test imports from the
  relative `src/render/...` path instead.
  
  256 tests (up from 240), including new coverage for the theme@1.4 chrome fields (date,
  `headerAction`, tagline, social links, footer note) and the `renderEntryHeader` integration.
  Zero gradients, zero decorative blur (D5), zero literal colour (verified by test), WCAG AA
  contrast in light and dark, no new npm dependency.
  
  **Known, deliberate limitation** (see the blueprint's own comment): the `magazine` blueprint
  keeps `article.section` a plain `f.select` field rather than a taxonomy, so a `collectionList`
  card can read it raw with no resolve step this theme's synchronous renderer has any way to
  perform. The trade-off is that the article page's own `renderEntryHeader` eyebrow — which only
  resolves taxonomy classifications — never shows a rubric for this blueprint's own demo content,
  even though the mechanism (and its accent-red styling) is real and works for any collection
  that does declare a taxonomy.

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
