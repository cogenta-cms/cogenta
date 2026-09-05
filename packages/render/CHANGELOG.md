# @cogenta/render

## 0.2.0

### Minor Changes

- 7a59646: L22 task 7 (documentation refonded — functional, technical, versioned,
  deployed): `@cogenta/render` gains a small, hand-written Markdown → HTML
  renderer purpose-built for `docs-site/content/**` (`renderMarkdownToHtml`,
  `renderMarkdownDocument`, `parseFrontmatter`, `MarkdownDocument`,
  `MarkdownHeading`) and `adaptDocHtmlForAdmin`/`DocTree`, which retargets the
  static site's relative page links into `/admin/documentation` routes.
  
  Purely additive — no existing export changed shape. Zero new dependency
  (R9): a second small hand-written scanner in the same spirit as
  `packages/admin/src/rich-text/markdown.ts`'s existing Markdown↔Slate
  converter, but for a different, plainer grammar (tables, indentation-driven
  list nesting, fenced code with a language tag, heading anchors) that
  documentation prose needs and the rich-text editor's grammar doesn't.
  
  This is what lets `docs-site/build/generate.mjs` (the statically published
  site) and `@cogenta/admin`'s `/admin/documentation` in-admin browser render
  the identical Markdown source through the identical function — the property
  the task asked for: never two copies of the documentation that can drift.
- 562c9c1: Add the "Apparence" admin screen (fiche 14) — the CMS's most-differentiating
  feature, AI skin generation, was previously exposed only through the CLI.
  
  - `@cogenta/render` gains `mergeSkinTokens` (`SkinTokenOverrides`): overlays a
    partial token tree onto a complete base skin, group by group, key by key.
  - `@cogenta/schema` gains `createThemeStore`/`ensureThemeTable` — one row of
    theme overrides (a partial token overlay, additional CSS, and four identity
    media references), the database half of the two-source-of-truth design
    task 0 settles on: `theme.tokens.json` stays the versioned file default,
    the database holds what an `admin` changed from the admin screen.
  - `@cogenta/plugins`'s `SkinGalleryEntry` now carries the accepted skin's real
    `tokens` (`null` for a rejected entry) — needed to render a swatch or apply
    a gallery skin, previously only metadata.
  - `@cogenta/api` gains `createThemeRouter` (`GET/PUT/DELETE /api/theme[/overrides]`,
    `GET /api/theme/skins`, `POST /api/theme/skins/:id/apply`,
    `POST /api/theme/generate`, `POST /api/theme/export`), plus the
    `SKIN_*`/`THEME_*` error-code → HTTP-status mappings it needs.
  - `@cogenta/cli` wires it all into `cogenta serve`/`dev`: `resolveStyles()`
    recomputes the served stylesheet on every request (file tokens merged with
    saved overrides plus additional CSS), which is what makes a saved change
    visible on the very next page view instead of only after a restart — the
    "hot swap" contract D already promised for the file alone. A new
    `POST /api/theme/preview` route renders the real home page with a candidate
    overlay nobody has saved yet, the same iframe-on-the-real-render decision
    L16 made for the page builder. Exporting the merged tokens back into
    `theme.tokens.json` is gated to `cogenta dev` only, mirroring the
    ADR-0010 rule L19's site-plan applier already uses for the schema file.
  
  R2 verified: without an LLM provider, `GET /api/theme` reports
  `aiAvailable: false` and the admin's AI section does not render at all — no
  error, no dead link. R6 verified: an AI-generated candidate or a chosen
  gallery skin is never applied automatically; a save is always a separate,
  explicit action.
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
- 86fc9cf: Fixed the media cache-busting bug audit 05-mediatheque §6 T02 found: replacing an
  uploaded file (`MediaStore.replace()`, fiche 11 task 4) has recorded a fresh
  `contentHash` since `theme@1.2`, and `RenderMediaAsset`/`MediaAsset.version` has existed
  on the type since then too — but `variantUrl()` never actually read it, and
  `loadRenderMedia()` (`cogenta serve`) never actually set it. The result: a replaced
  logo kept serving under the exact same `/_image?id=…` query string a year-long
  `Cache-Control: immutable` response had already cached, everywhere that image was
  already rendered.
  
  `@cogenta/render`'s `variantUrl()` now folds `media.version` into every candidate URL
  as `&v=` when present, unchanged (no `&v=`) when absent — fully backward compatible for
  a media entity built without this field. `@cogenta/cli`'s `loadRenderMedia()` now sets
  `version: asset.contentHash`, so `og:image`, JSON-LD's `image`, and every `srcset`
  candidate all change URL the moment a file is replaced, which is what actually protects
  a page a browser or CDN has already cached: an `immutable` response is never
  revalidated, so the origin's own stored bytes changing is not what breaks the cache —
  only the URL changing is.
  
  Also documents the `version` field on contract D's `MediaReference` (`docs/04-contrats.md`
  § Contrat D), additive to `theme@1.2`.
- 54409f3: Media library (fiche 11): tags, usage tracking, in-place replace, and richer
  listing.
  
  **Breaking for a custom `MediaStore` implementation**, written as `minor`
  following this project's established pre-alpha convention (0.x, no package
  has ever used `major`, and one here would jump straight to `1.0.0` — which
  "pre-alpha" contradicts). `@cogenta/core`'s `MediaStore` interface gains two
  new required methods, `count()` (the total match count ignoring
  `limit`/`cursor`, so the admin can show "2,000 assets" instead of only "there
  is another page") and `replace()` (overwrite the bytes behind an existing id
  in place — every entry and block already holding that id keeps working,
  unchanged). `MediaAsset` gains two new required fields: `tags` (free-form
  labels, not a hierarchy — an asset commonly belongs to more than one subject
  at once) and `contentHash` (a short digest of the stored bytes, folded into
  `/_image` URLs as `&v=` to bust the year-long immutable cache when an asset
  is replaced — never a secret, never used for integrity). The only
  implementation in this repo, `createDatabaseMediaStore`, is updated; a
  third-party driver is not.
  
  Backward-compatible additions: `CreateMediaInput`/`UpdateMediaInput` gain
  optional `tags`; `ListMediaOptions` gains `tag`, `from`/`to` (created-at
  range), `sort` (`MediaSortField`: `createdAt`/`filename`/`size`), and
  `direction`. `@cogenta/render`'s `MediaAsset` gains an optional `version`
  field (`theme@1.2`) — absent is fully backward compatible, exactly today's
  behaviour with no `&v=` appended.
  
  `@cogenta/api`'s `createMediaRouter` gains real multipart parsing
  (`packages/api/src/rest/multipart.ts`, zero new dependency — R9/R10), a
  `POST /api/media/{id}/replace` route, `tag`/`from`/`to`/`sort`/`direction`
  query parameters on the list route, and EXIF GPS stripping on upload and
  replace (`stripGps`, opt-out per request, default on — a photo's location is
  not something an editor usually means to publish).
  
  `@cogenta/schema` gains `findMediaUsage` (`packages/schema/src/media-usage.ts`):
  scans every collection's entries for a media id in a `media`/`richText`/
  `blocks` field and reports where it is referenced, so the admin can warn
  before deleting an asset still in use rather than after. `titleOf` (from
  `search/extract.ts`) is now exported — `findMediaUsage` needed the same
  "what does an editor call this entry" logic the search indexer already had,
  and duplicating it would have drifted.

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [0e88f30]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [4335296]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [4d3f3c7]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [2285720]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [1995d35]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [07c0f0a]
  - @cogenta/core@0.5.0
  - @cogenta/blocks@1.0.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0
  - @cogenta/blocks@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/blocks@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/blocks@0.1.2

## 0.1.0

### Minor Changes

- [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the skin system of contract D to `@cogenta/render`: design tokens, CSS variables and
  hot swap.
  
  **Tokens.** `validateSkin` takes a raw `tokens.json` and returns it typed, or refuses it.
  The token set is closed: a missing token *and* an unknown token are both refused, so a
  skin can never leave a variable undefined nor smuggle in presentation the theme never
  declared.
  
  **Validation, in hard-refusal mode.** WCAG 2.2 AA contrast on the three declared pairs
  (`fg`/`bg`, `accentFg`/`accent`, `mutedFg`/`muted`), a strictly increasing typographic
  ladder, well-formed colours, lengths and durations, and `motion.reduced`. A refusal names
  every failure of its category at once — for contrast, the pair, its measured ratio and the
  shortfall. Relative luminance and the contrast ratio are computed in the package, without
  a dependency.
  
  **CSS.** `renderSkinCss` emits one stylesheet of `--cogenta-<group>-<name>` custom
  properties, plus the derived font-size ladder and a density multiplier, and honours
  `prefers-reduced-motion` in the sheet itself rather than only in the token.
  
  **Hot swap.** `createSkinStore(tokens).apply(next)` validates and rewrites the sheet with
  no build step, in well under a millisecond, and keeps the previous skin live if the new
  one is refused. Each sheet carries a content ETag that is stable for identical tokens.
  
  New error codes in `@cogenta/core`: `SKIN_TOKEN_MISSING`, `SKIN_TOKEN_UNKNOWN`,
  `SKIN_TOKEN_INVALID`, `SKIN_CONTRAST_INSUFFICIENT`, `SKIN_SCALE_NOT_MONOTONIC`,
  `SKIN_MOTION_NOT_REDUCED`.

- [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the three build targets — static, Node SSR, edge — and the refusal that keeps a static
  build honest.
  
  The target is a build parameter, never a theme variant: the renderer is handed the route
  and nothing else, so it *cannot* branch on the target. That is what makes "the same
  content produces an equivalent result on the three targets" a property of the code rather
  than a promise, and the equivalence test compares the three builds byte for byte.
  
  A build collects every declared runtime need first — blocks, theme, plugins — and judges
  afterwards. `collectionList` is the one block of the twelve that declares
  `runtime: 'server'`, so the case is real on the first site that places a listing. On a
  static target the build is refused before a single page is rendered, with a message that
  names the block, the pages it sits on and their block keys, why a static build cannot
  carry it, and the three ways out: build for `--target node` or `--target edge`, move the
  work to an external service the browser calls, or remove the element. Every offending
  element is reported at once, so an operator takes one decision rather than one build per
  problem. Nothing degrades silently: no dropped block, no build-time snapshot of a live
  list.
  
  On the two request-time targets the split is hybrid and identical: pages with a
  server-side need are served on request, the rest are still prerendered. An unregistered
  block is refused rather than assumed static — guessing a runtime is how a server-side
  block slips into a static build.
  
  Core adds two error codes, `BUILD_TARGET_UNKNOWN` and `BUILD_RUNTIME_UNSATISFIED`.

- [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the image pipeline, the three build targets, the tag-invalidated page cache and the
  PWA to `@cogenta/render`.
  
  Images are a driver like any other: `sharp` at the optimal tier as an optional peer, a
  WebAssembly libvips fallback at the degraded tier, and one contract suite run against
  both. The fallback runs **unconditionally**, not when `sharp` happens to be missing — a
  suite that stops exercising it on the maintainer's laptop is exactly the hole L3 warns
  about. `/_image` caps requested dimensions, because it is a public URL and a loop over
  widths would otherwise be a cache-filling attack.
  
  A build target is a parameter, never a theme variant: the renderer is handed a route and
  returns a string, so a theme cannot branch on the target even if it wanted to, and
  equivalence across static, Node and edge is structural rather than promised. A static
  build carrying a `runtime: 'server'` block is refused with a message naming the element,
  where it sits in the site, and three numbered ways out — asserted byte for byte so the
  wording cannot quietly degrade.
  
  The page cache derives its tags by instrumenting what a render actually read, not by
  declaration, which would be wrong at the first omission. A list page carries its
  collection's tag and a detail page does not, so publishing an entry that was never in
  the cached page still drops the list.

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

- [`99aa9b2`](https://github.com/cogenta-cms/cogenta/commit/99aa9b2fb2bbedeacf658b57008a863f6af81d45) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the page cache's dependency collection to what the content API declares a response
  was built from, closing the gap a server-side relation expansion left open: an article
  page that inlines its author had no way to know the author changed, because the
  author's id never crossed the content client as a request of its own. The HTTP client
  now reports `meta.dependencies` from every response through an `onDependencies` hook,
  consumed by the render cache alongside what it already records directly.

- [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/render`: the Astro integration, the `RenderContext`, and the theme installation check.
  
  - `cogentaTheme()` is an Astro integration that resolves the active theme from the
    configuration, aliases its sources as `@theme`, and exposes its manifest through the
    virtual module `virtual:cogenta/theme`. The content token never enters Vite's module
    graph.
  - `createRenderContext()` builds exactly the `RenderContext` contract D freezes at
    `theme@1.0` — `site`, `locale`, `url`, `t()`, `image()`, `link()`, `content` — and
    nothing else.
  - `ctx.content` is an HTTP client to the content API carrying a read-only token
    (ADR-0016). It links against neither `@cogenta/schema` nor a database driver, so a
    theme cannot reach a draft even by asking.
  - `verifyTheme()` refuses a theme at installation, naming file, line and import, when it
    does not declare the twelve blocks of the vocabulary, or when it reaches for a
    forbidden module — directly, through the unprefixed spelling of a builtin, through a
    subpath, through an unreadable dynamic `import()`, through CommonJS, or through a
    `package.json` alias. Refused, not warned.
  
  `@cogenta/core` gains the error codes `THEME_NOT_FOUND`, `THEME_INVALID`,
  `THEME_BLOCK_MISSING`, `THEME_IMPORT_FORBIDDEN` and `CONTENT_API_FAILED`.

### Patch Changes

- [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `MediaStore` to `@cogenta/core` — the persisted metadata record for a media
  asset (alt text, decorative flag with a required justification, focal point,
  dimensions, storage key), backed by one SQL table played against SQLite,
  Postgres and MySQL through the same contract, the same shape as the degraded
  job queue. Nothing wired this to a route yet: L2 task 11 (médiathèque) is
  still in progress, and this is its data layer.
  
  Alt text policy is enforced in the store, not left to a caller to remember:
  a non-decorative asset needs non-empty alt text, and a decorative one needs a
  justification, writing `alt=""` regardless of what was passed — matching
  L2-admin.md's own rule that a decorative image never gets an invented
  description.
  
  `sniffImageFormat`/`describeContainer` (real-type detection by magic bytes,
  never by filename or `Content-Type`) moved from `@cogenta/render` into
  `@cogenta/core`, since the upcoming media upload route needs the exact same
  check and depending on `@cogenta/render` for four byte-signature functions
  would pull in its Astro/sharp integration for no reason. `@cogenta/render`
  re-exports both from its own `images` module, so no call site there changes.
  
  ADR-0017 records the SVG policy this data layer assumes: refused by default,
  never served raw, until a reviewed sanitizer exists.
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/blocks@0.1.0
