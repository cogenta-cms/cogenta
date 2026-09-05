# @cogenta/theme-canonical

## 1.1.0

### Minor Changes

- [`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the new `renderThemeToggle` into the header, styled as `.cg-theme-toggle`. Every page now offers a manual light/dark/system control; the CSS to support it already existed.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0

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
- edf5623: Fiche 15 — comments (ADR-0025, new contract F, `comments@1.0`):
  
  - **New package `@cogenta/comments`**: the comment model and store
    (`CommentStore`) — plain-text body only (R3: no HTML tags accepted, ever),
    hashed IP (never stored in clear, RGPD), moderation status
    (`pending`/`approved`/`spam`/`trash`), threading via `parentId`,
    `provenance`. A reversible migration (`ensureCommentsTables`/
    `dropCommentsTables`), tested up/down/up on SQLite; Postgres/MySQL/MariaDB
    integration tests are written (`test/integration/tables.test.ts`) but not
    executed this session (no local Docker). `createCommentsRouter` is the
    CMS's first public write route (`POST /api/comments`, no actor required)
    plus the admin moderation queue, both behind contract F's own permission
    vocabulary (`comments.read`/`moderate`/`reply`/`purge`/`settings`, distinct
    from contract A's five frozen actions). The public route enforces, from
    day one: rate limiting by IP and by target (`createCommentRateLimiter`),
    a honeypot field, a minimum fill-delay, non-AI spam heuristics
    (`checkSpamHeuristics`), and the WordPress "auto-approve a returning
    commenter" rule. A no-JS `<form method=post>` gets a `303` redirect back to
    its own page (`redirectTo`, validated against open-redirect and HTTP
    response-splitting) instead of a raw JSON body.
  - **`@cogenta/core`**: ten new error codes (`COMMENT_NOT_FOUND`,
    `COMMENT_BODY_INVALID`, `COMMENT_AUTHOR_INVALID`, `COMMENT_TARGET_INVALID`,
    `COMMENT_TARGET_CLOSED`, `COMMENT_PARENT_INVALID`,
    `COMMENT_PARENT_TOO_DEEP`, `COMMENT_STATUS_INVALID`,
    `COMMENT_RATE_LIMITED`, `COMMENT_SPAM_DETECTED`).
  - **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY` gains the `discussion`
    group (`discussion.enabled`/`moderationRequired`/`allowAnonymous`/
    `autoCloseDays`/`maxNestingDepth`/`notifyEmail`) — the site-wide defaults
    a collection or an entry can still override from `@cogenta/comments`'s own
    settings store (per-collection/per-entry overrides deliberately do not
    live in this registry, which is site/locale scoped only).
  - **`@cogenta/api`**: `shell-status-router.ts` gains `commentsPending` (a
    structural `CommentsQueueLike`, the same pattern `commerceOrdersPending`
    already uses) — additive, existing callers that never pass `comments` see
    `null` exactly as before.
  - **`@cogenta/theme-canonical`**: `renderCommentsSection` — the comment
    thread and its plain-HTML submission form, built through the existing
    `h()`/`text()` tree (no `raw()` escape hatch exists in this package, which
    is what makes "no visitor HTML ever reaches the page" structural rather
    than a habit to remember). Rendered by `renderEntryPage`
    (`@cogenta/cli`'s `theme-render.ts`) after the page's own `<main>`, on both
    the published page and the L16 page-builder preview's own draft render —
    except the preview, which never shows it (its `_ts` anti-spam field cannot
    be identical across two separate renders, so byte-identity there would be
    comparing two different legitimate values; `serve-builder.test.ts`'s
    fidelity test now documents this as a deliberate, checked difference).
    Contract B is untouched — no `comments` block, same reasoning L10 gave for
    `/search`.
  - **`@cogenta/import`**: `importWordPress` gains an optional `comments`
    option (a `CommentStore`) — when given, every importable WordPress comment
    is written with its real status (`wp:comment_approved` mapped to
    pending/approved/spam/trash, not just `'1'`), real threading
    (`wp:comment_parent`), on **both** posts and pages. Pages never imported a
    single comment before this — a real, independent bug, not something this
    fiche introduced, found while checking what the importer does today per
    the fiche's own instruction. Inline HTML a legacy WordPress comment form
    allowed (`<a>`, `<em>`, …) is stripped to plain text and reported (R3: no
    escape hatch). Absent `comments` keeps the pre-fiche-15 behaviour
    unchanged (approved-only, posts-only, the synthetic `comment` collection)
    for a caller that has not wired `@cogenta/comments` yet — its `post` field
    is a hard `relation` to the `post` collection specifically, so extending
    it to pages was never an option, only the real store is.
  - **`@cogenta/cli`**: `cogenta serve` mounts `/api/comments` (public POST +
    moderation queue), extends `readBody` to also parse
    `application/x-www-form-urlencoded` (the no-JS form's own content type —
    every other route still only ever sends JSON), wires the comment thread
    into `theme-render.ts`'s page render, and passes a real `CommentStore`
    into every `importWordPress` call site (the terminal command and the
    admin's import screen alike). `cogenta doctor`/`serve` create contract F's
    tables idempotently, the same way commerce's tables are created — a site
    that never receives a comment never pays for them.
  
  Admin (`@cogenta/admin`, private, no changeset): a moderation queue screen
  (`/comments`, counters, bulk actions, search, reply-from-the-admin), a
  pending-count nav badge, `assist.moderate` reused verbatim as an indicator
  (never an action — its own closed `none`/`review` union already guarantees
  that, per the fiche's own instruction not to build a second decision path),
  a "Discussion" settings tab (previously a placeholder), and a per-entry
  comments toggle in the entry editor sidebar.
- dda55d6: Fiche L23 (le thème unique, enfin réel) — l'infrastructure qui rend un second
  thème de site public installable, sans laquelle le reste du lot (les thèmes
  eux-mêmes, l'écran de sélection) n'aurait rien à brancher.
  
  **Le vrai verrou, précisément nommé** : `cogenta serve` importait
  `@cogenta/theme-canonical` de façon statique dans `theme-render.ts` — `renderPage`
  et, plus contraignant encore, le `<header>`/`<footer>` du site étaient
  littéralement écrits en dur dans le CLI, aux classes CSS de ce seul thème.
  Un second thème ne pouvait donc pas simplement fournir d'autres blocs : il
  lui fallait aussi un point d'extension pour sa propre bannière, qui
  n'existait pas.
  
  **Nouveau paquet `@cogenta/theme-kit`** : le contrat partagé qu'un thème
  implémente (`RenderContext`, l'arbre HTML sans échappatoire `raw()`, le texte
  riche, la section de commentaires, les aides d'entrée, `PageContent`, et les
  nouveaux types `ChromeInput`/`ChromeResult` du point d'extension) — sorti de
  `@cogenta/theme-canonical`, qui portait depuis L3 un commentaire s'excusant
  déjà que ce code soit une « maison temporaire ». Une seule copie, revue une
  fois, au lieu d'une copie par thème qui aurait fini par diverger — en
  particulier `ImageSource`/`ImageOptions` gagnent au passage `kind`/`poster`
  (contract D `theme@1.1`, déjà utilisé par `describeMedia` mais jamais exposé
  au thème lui-même) : le premier vrai support d'une vidéo en `hero`/
  `mediaFigure`, gratuit pour tous les thèmes à la fois. `@cogenta/theme-canonical`
  réexporte tout à l'identique — sa propre surface publique ne change pas.
  
  **Le registre de thèmes** (`@cogenta/cli`, `theme-registry.ts`) : une
  résolution par nom, mémoïsée, repliant tout nom absent ou inconnu sur
  `@cogenta/theme-canonical` plutôt que de refuser de servir (R1/R2).
  
  **Le point d'extension chrome** : `theme.renderChrome(input)` remplace le
  gabarit figé — chaque thème dessine désormais son propre en-tête/pied de
  page ; `cogenta serve` ne fait plus que résoudre la navigation et la mention
  de marque (toujours de sa responsabilité, jamais celle d'un thème) et les
  transmet. `@cogenta/theme-canonical` gagne ce `renderChrome`, produisant un
  HTML strictement identique à l'ancien gabarit — aucune régression visuelle
  pour un site existant.
  
  **Sélection en direct, sans redémarrage** : `cogenta_theme` (la même table
  que les réglages d'apparence) gagne une colonne `active_theme`, ajoutée en
  place à une table existante (le même geste que `menu-tables.ts` avait déjà
  fait pour `location`) — une base déjà provisionnée n'est jamais perdue.
  `GET/PUT /api/theme` connaît désormais la liste des thèmes installés et
  refuse un nom que cette instance ne sait pas résoudre (`THEME_NOT_FOUND`,
  404, nouveau dans la table de statuts). La feuille de style du thème actif
  est mémoïsée par nom (`createThemeCssResolver`) : changer de thème depuis
  l'écran d'apparence prend effet à la prochaine page vue, exactement la même
  promesse que la personnalisation de couleurs tient déjà.
  
  **Vérifié de bout en bout** : le thème canonique sert un document identique
  à l'ancien via `renderPageChrome`/`renderEntryPage` (472 tests `@cogenta/cli`,
  dont `serve.test.ts`/`serve-builder.test.ts` — la fidélité octet pour octet
  du constructeur de page L16 tient toujours), 121/121 `@cogenta/theme-canonical`,
  652/652 `@cogenta/schema`, 1052/1052 `@cogenta/api`. `pnpm turbo run typecheck`
  et `pnpm turbo run build` : 52/52 et 27/27 tâches, espace de travail entier.
  
  Ce lot n'ajoute encore aucun second thème installable — c'est la matière du
  prochain changeset. Sans cette fondation, un second thème n'aurait eu nulle
  part où brancher sa propre bannière.
- befad6d: Consumes contract D `theme@1.4` (L25 D2): `renderChrome` shows `tagline` under the site
  name in the footer, `social` as an icon-link row (`renderSocialLinks`,
  `@cogenta/theme-kit`), `footerNote` as a short "about" column, and `headerAction` as a
  button-styled link at the end of the header nav. `renderPage` now renders
  `renderEntryHeader` (cover, byline, date, terms, reading time) in place of the bare
  `.cg-page__title` heading when `PageContent.entry` is present and no `hero` block already
  draws its own `<h1>`. `featureGrid` items now render a real inline icon
  (`renderIcon`, `@cogenta/theme-kit`) inside the existing `.cg-feature__icon` chip, for
  every name in the new ~50-name vocabulary; an unrecognised name keeps the pre-L25 empty
  chip.
  
  All four are optional and additive: a render that sets none of the new `ChromeInput`
  fields, and a page with no `entry` meta, both produce byte-identical output to before
  this change (`test/chrome.test.ts`, `test/entry-header.test.ts`).
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
- 1995d35: Fiche 42 task 2 — the rich text vocabulary (contract A, ADR-0013) gains a
  `strikethrough` decorator and an `hr` (thematic break) node, both additive:
  `RICH_TEXT_DECORATORS` now includes `'strikethrough'` alongside the existing
  `strong`/`em`/`code`, and `richTextNodeSchema` accepts a third node shape,
  `{ _key: string, _type: 'hr' }`, carrying nothing beyond its key. No existing
  document changes shape — a `richText` value stored before this change parses
  identically after it. A consumer still on the previous minor cannot validate
  a document that uses either addition, the same one-directional compatibility
  already accepted for `schema@2.1`'s `reviewState` and `tools@1.1`'s
  `document.extract`.
  
  `@cogenta/blocks`'s own temporary mirror of the richText shape (used to
  validate a `prose`/`quote`/`testimonial`/`faq`/`accordion` block's body)
  gains the same `hr` node — its `marks` field was already an open string
  array, so `strikethrough` needed no change there.
  
  `@cogenta/theme-kit`'s `renderRichText` — the single function every theme in
  this monorepo imports rather than reimplementing (`@cogenta/theme-canonical`
  and the four site themes' `blocks/prose.ts` all call it directly) — renders
  `strikethrough` as `<s>` (semantically "no longer accurate", not `<del>`,
  which would imply an edit-tracking deletion) and a thematic break as a bare
  `<hr class="cg-prose__rule">`. `@cogenta/theme-canonical` re-exports the
  same function unchanged; its own `prose` block snapshot fixture now
  exercises both additions end to end.
  
  `@cogenta/admin` (private, no changeset) gains the corresponding editor
  support: a strikethrough toolbar button, a horizontal-rule insert button and
  slash-menu entry, Markdown (`~~text~~`, a bare `---` line) and HTML (`<s>`,
  `<hr>`) source-view round-tripping, and clean-paste recognition of `<s>`/
  `<strike>`/`<del>` and a pasted `<hr>` (previously dropped outright).
  
  Same commit also fixes an unrelated, pre-existing CSS bug (fiche 42 task 1):
  `.rich-text-editor__surface` had no `min-height` outside fullscreen, so a
  freshly opened entry's editing area measured exactly one line. `@cogenta/admin`
  only; no published-package surface involved.

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
- 154a751: Fiche 22 tâche 8 (finitions d'admin) — several small, independently useful
  changes across the published packages:
  
  `@cogenta/core`'s `package.json` now declares `"./package.json"` in its
  `exports` map, so a dependent (`@cogenta/cli`) can resolve its own real
  installed version through Node's standard ESM resolution instead of a
  hand-maintained copy. Purely additive; nothing else in the package changes.
  
  `@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` gains a `navigation` group and
  four new keys (`navigation.sectionOrder`, `navigation.hiddenSections`,
  `navigation.itemOrder`, `navigation.hiddenItems`) — site-wide admin sidebar
  reordering and hiding (e.g. "hide the Commerce section on a portfolio
  site"), stored the same comma-separated-list way `content.
  newEntryDefaultBlocks` already is. Additive to the registry; no existing key
  changes shape or default.
  
  `@cogenta/api`'s `ShellStatus` (and `createShellStatusRouter`'s
  `ShellStatusRouterOptions`) gains `cogentaVersion: string` — the installed
  `@cogenta/core` version, answered to every actor including an anonymous
  one (never secret), consumed by the admin footer/topbar. A caller that does
  not pass `cogentaVersion` gets `'0.0.0'` rather than `undefined`.
  
  `@cogenta/cli` gains `getCogentaVersion()` (`commands/cogenta-version.ts`),
  resolving `@cogenta/core`'s own `package.json` version through
  `import.meta.resolve` and caching it. `cogenta serve` now threads this
  version into `GET /api/shell-status` and, when Cogenta's own branding stays
  on, into the public site footer next to its existing credit — extending
  `ThemeRenderOptions`'s `BrandingSettings` with an optional `cogentaVersion`
  field, never duplicating the branding on/off logic itself.
  
  `@cogenta/theme-canonical`'s `base.css` gains a small `.cg-site-footer__version`
  rule for the version text above, and a `gap` on `.cg-site-footer__branding a`
  so the logo and the version sit apart cleanly — no structural change to the
  footer markup beyond the one optional `<span>`.
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
- fe789cf: Fiche L21 task 8 — Cogenta's own logo and credit, and a white-label override.
  
  Nothing branding-related existed before this: the admin's topbar carried a
  plain `//` text mark, and the public footer showed only the site's own name
  and its footer nav. `@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` gains a new
  `branding` group — `branding.showCogentaBranding` (boolean, `true` by
  default) and `branding.customLogoMediaId` (a media id, or unset) — persisted
  through the same generic key/value settings table every other editorial
  setting already uses, so no migration was needed for it.
  
  `@cogenta/cli`'s public theme render (`theme-render.ts`, both `renderPageChrome`
  and `renderEntryPage`) now renders a small branding block in the site
  footer: Cogenta's own logo and a link back to the project by default, the
  site's uploaded replacement once Cogenta's credit is turned off (served
  through the same public `/_image` endpoint every other image on the page
  already uses), or nothing once it's off with no replacement. Cogenta's own
  logo is served at a new, permanently cacheable `/_cogenta/logo-cogenta.png`
  route — a 64×64 PNG resized from the vendored source with the project's own
  WASM image driver (zero new dependency, R9/R10), the same degraded-tier
  codec `/_image` already relies on. Read live per request off the same
  settings store `reading.homePath` already reads, so turning branding off
  shows up on the very next page view, not the next restart — verified end to
  end (`test/serve-branding.test.ts`) on the home page, `/search`, and the
  page builder's own preview (whose fidelity test asserts its `<body>` stays
  byte-identical to the published page's — the branding block had to be wired
  identically on both paths for that to still hold).
  
  `@cogenta/theme-canonical`'s `base.css` gains the `.cg-site-footer__branding`
  rules the new markup needs.
- 8c98093: Fix rich text (`richText` field) rendering when it carries a `media` node or an
  `internalLink` mark (ADR-0013): `cogenta serve` now resolves both before rendering, the
  same way it already did for a `collectionList` block's entries. Previously, an image
  placed inside a paragraph could make the whole page throw (`THEME_IMAGE_UNSUPPORTED`,
  the asset was never fetched), and an internal link inside prose always rendered a dead
  `<a href="#">` since its target was never looked up.
  
  An internal link whose target cannot be resolved — trashed, still a draft, or renamed
  away and gone — now renders as plain text instead of a dead anchor, on `@cogenta/theme-canonical`'s
  own recommendation for a stale link: never a 404, never a link to nowhere.
- 2299569: L20 audit, two real bugs in public-facing pages.
  
  **`/search` found nothing, even for words plainly on a freshly scaffolded
  site's own seeded demo content.** Every blueprint's `seedDemoContent`
  (`create-cogenta`) and `resetPlaygroundData`'s reseed write straight through
  `createContentStore`, never through the `withSearchIndexing`-wrapped store
  `cogenta serve` builds at startup — so the seeded rows existed in the content
  tables but never reached the search index table. Both now reindex every
  seeded collection against the site's real search index (`createSearchIndex` +
  `reindexAll`, the same pair `cogenta`'s own "Reindex search" tool uses)
  immediately after seeding, so the physical index and the content it describes
  are never out of step from the moment a site exists.
  
  **`/search` and `/forms/{name}` rendered with none of the site's visual
  chrome**, even though both already linked the site's stylesheet: they built
  their own thin `<html>` shell rather than the frame every collection page
  gets (skip link, `color-scheme` meta, header with primary nav, footer with
  footer nav) — the stylesheet loaded, but the markup its selectors target was
  never on the page. `@cogenta/cli` extracts that frame into a new
  `renderPageChrome` (`theme-render.ts`) and both pages now call it, menu
  wiring included. `renderFormPage`/`renderFormNotFoundPage` are now async and
  take an `AccessContext`, to match. The comment thread appended after an entry
  page shared the same gap — `@cogenta/theme-canonical`'s `base.css` gains the
  missing `.cg-search__*`, `.cg-form__*` and `.cg-comment__*` rules, at the same
  page-width measure `.cg-page__title` already sets.
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

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@0.1.4

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
