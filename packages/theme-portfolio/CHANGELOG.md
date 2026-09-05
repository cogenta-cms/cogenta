# @cogenta/theme-portfolio

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
- 4856972: L25 Annexe pro pass on `theme-portfolio` (brutalist-editorial, electric
  violet accent) — the same identity, raised to `theme@1.4` and given a real
  project grid, working navigation, and a genuinely flat dark mode.
  
  **Chrome (`theme@1.4`)**: `renderChrome` now uses every 1.4 field — a real
  desktop `<nav>` plus a CSS-only mobile menu (checkbox + `<label>`, no
  JavaScript, same mechanism `theme-saas` uses), `headerAction` as a filled
  button ("Let's talk"), and a footer that adds `tagline`, `renderSocialLinks`
  and `footerNote` beside the existing large closing statement and branding
  credit. **A real, verified bug found and fixed while testing this in a
  browser**: the desktop `.cg-site-header__nav { display: flex }` rule was
  declared *after* the `@media (max-width: 56rem)` block that hides it below
  the breakpoint; with identical specificity, the later declaration always
  wins regardless of the media query, so the mobile nav rendered permanently
  open, overlapping the hero, at every width below 896px. Fixed by declaring
  the default before the override (the correct source order for two rules of
  equal specificity); a CSS-source regression test locks the order in.
  
  **`collectionList`**: `grid`/`carousel` layouts now render full-bleed
  project cards (`entryImage`, 4:3, one column at 360px, two from 1280px) with
  the entry's own raw `role`/`year` fields as a meta line, and a flat offset
  `translate()` + hard shadow on hover/focus — never a blur. `list` keeps the
  theme's original numbered-index rows unchanged. **A second real bug found
  by screenshot**: `.cg-collection__items` (an `<ol>`) never suppressed the
  browser's own decimal marker, so every entry — on every layout, since
  before this pass — showed a native "1." beside this theme's own "01" index
  badge; fixed with `list-style: none`.
  
  **`featureGrid`**: items now render their `icon` (`theme@1.4`'s
  `renderIcon`) above the existing numbered-index treatment, rather than
  carrying `data-icon` with no visual glyph at all.
  
  **Project pages**: `renderPage` now draws `renderEntryHeader` (title, cover,
  excerpt from `summary`) for an entry-backed page. `role`/`year` are not
  threaded to a page's own render under the current `theme@1.4` contract
  (`PageEntryMeta` has no room for a collection's custom fields, and
  `toVocabularyBlocks` never populates `page.blocks` for a collection with
  no `blocks`/`richText` field) — worked around in-scope by giving `project`
  an optional `blocks` field and seeding one auto-built, flat "Role / Year"
  panel (a `prose` block with `variant.background: "muted"`) per project.
  **A third real bug found by screenshot**: that panel's own first paragraph
  ("Role Art direction") inherited the theme's editorial drop-cap on its
  first letter, rendering a giant serif "R"; fixed by opting any
  background-variant `prose` block out of the drop cap.
  
  **Dark-mode elevation rebuilt from a glow into a flat shadow (L25 D5,
  binding)**: `--cg-elevation-{1,2,3}` used to pair a hairline ring with a
  soft `0 0 Nrem` accent-tinted blur in dark mode — a glow, the exact
  "100% AI" register the product owner ruled out. Both dark-mode branches now
  draw the *same hard, zero-blur offset geometry* light mode's own
  `shadow.sm`/`shadow.md` use, recoloured in `--cg-line-strong` (the
  brighter-than-surface line this palette already uses for depth). The now
  unused `--cg-accent-glow` token is removed.
  
  **Also fixed**: `theme.config.ts`'s stale `theme@1.1` header comment and
  `collections: ['article', 'page']` (the blueprint's real collection is
  `project`, not `article`) are corrected; `.cg-main` gains `overflow-x: clip`
  matching the other L25 themes.
  
  Verified: `typecheck`, `build`, and the full test suite — 314/314 (was 294)
  — including new tests for the mobile-menu source-order fix, the `<ol>`
  marker fix, the drop-cap fix, `entryImage`/`role`/`year` grid cards, and
  `renderIcon` in `featureGrid`. A real site (`portfolio` blueprint,
  `create-cogenta`) was scaffolded, served, and inspected in a real browser
  at 360/768/1280 on the home, a project and the about page, with the mobile
  menu actually opened — all three bugs above were found this way, not by
  reading the code.

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
