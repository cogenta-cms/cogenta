# @cogenta/schema

## 0.4.0

### Minor Changes

- [`7b7ec0b`](https://github.com/cogenta-cms/cogenta/commit/7b7ec0b897735c1323bb733ae6ba76a522f72669) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `ContentStore.count()` — a single `GROUP BY status` plus a trash count,
  never a page scanned client-side — and `ContentService.summary()` /
  `GET /-/summary` on top of it: one request that answers every collection an
  actor may read with its status counts (`draft`/`scheduled`/`published`/
  `archived`/`trashed`/`total`), each figure `null` rather than a fabricated
  `0` when the actor may not read that collection's unpublished rows or its
  trash. This is the shared implementation the admin's dashboard content
  summary widget and the collection list's status tabs both build on. Purely
  additive: no existing method, route or response shape changes.

- [`0ca8a79`](https://github.com/cogenta-cms/cogenta/commit/0ca8a797288624a3c4d53ca0942687d9e570b186) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add optimistic concurrency detection and per-field error naming for the entry editor (fiche 02, tasks 3 and 7).
  
  - `@cogenta/core` gains the `CONTENT_STALE_WRITE` error code.
  - `@cogenta/schema`'s `UpdateInput` gains an optional `expectedUpdatedAt`. When a caller
    passes it, `update()` compares it against the live row's `updatedAt` and refuses with
    `CONTENT_STALE_WRITE` (409) if someone else's write landed first, instead of silently
    overwriting it. Omitting it keeps the previous last-write-wins behaviour unchanged.
  - `@cogenta/api`'s `PATCH` body accepts the new `expectedUpdatedAt`, and `errorResponse`
    now includes `error.field` for `CONTENT_INVALID`/`CONTENT_SLUG_INVALID` refusals, naming
    the schema-declared field the error is about so a client can drive per-field validation
    UI without parsing the message.
  
  Both additions are additive and backward compatible: existing callers that never send
  `expectedUpdatedAt` see no behaviour change, and `error.field` is only ever present for
  the two codes listed above.

- [`c392e24`](https://github.com/cogenta-cms/cogenta/commit/c392e24880a29388fc63a08388042bf163817619) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Redirects: 404 log, prefix patterns, editing, CSV import/export, automatic
  redirect on slug rename, and 307/308/410 status codes (fiche 12).
  
  **`@cogenta/core`**: gains a `notFoundLog` config section (`enabled`,
  `maxPaths`, `retainDays`) — on by default, bounded, purged past its
  retention. Never stores an IP address or a user agent.
  
  **`@cogenta/schema`**:
  - `RedirectStatus` widens from `301 | 302` to `301 | 302 | 307 | 308 | 410`.
    A 410 (Gone) row needs no `to`. Consumers that exhaustively switch on
    `RedirectStatus` — a rare pattern, but a real one — need a case for the
    three new values.
  - `RedirectStore` gains `update(from, { to?, status? })` — implementors of
    the interface (not typical callers) must add it. `RedirectStore.add`'s
    `to` is now optional, required only when `status` is not 410.
  - New: `createNotFoundLogStore`/`NotFoundLogStore` (the 404 log — aggregated
    by path, capped at `maxPaths` distinct paths, no personal data ever) and
    `createRedirectPatternStore`/`RedirectPatternStore` (prefix redirects —
    `/blog/*` to `/actualites/*` — matched by `startsWith`, never a regular
    expression, so the public routing path can never be exposed to
    catastrophic backtracking).
  - New: `withRedirectTracking` — wraps a `ContentStore` so renaming the slug
    of a **published** entry writes a 301 from the old path to the new one on
    its own, reversibly (renaming back makes the redirect disappear), and a
    chain of renames stays flattened to one hop.
  
  **`@cogenta/api`**: `redirect-router.ts` gains `PATCH /api/redirects` (edit
  in place), `?q=`/`?limit=`/`?offset=` on the list, `/api/redirects/patterns`
  (prefix redirects), and `/api/redirects/export` / `/api/redirects/import`
  (CSV, always previewed before anything is written — pass `apply: true` to
  commit). New `createNotFoundRouter` (`GET`/`DELETE /api/not-found`). New
  `parseCsv`/`stringifyCsv` — hand-written, zero dependency (R9).
  
  **`@cogenta/cli`**: `cogenta serve` mounts `/api/not-found` and the new
  `/api/redirects/*` routes, applies prefix-redirect resolution after the
  exact-match table finds nothing, answers a 410 with no `Location` header,
  records every public GET that matches no route into the 404 log (never for
  `/api/*`), and purges the log past its retention on a daily tick (new
  `ServeOptions.notFoundPurgeTickMs` overrides it, for tests). Renaming the
  slug of a published entry now writes its redirect automatically, wired
  through `withRedirectTracking`.

- [`562c9c1`](https://github.com/cogenta-cms/cogenta/commit/562c9c1ee4d52b3e7f624e3b54ae033c2bd01e1c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the "Apparence" admin screen (fiche 14) — the CMS's most-differentiating
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

- [`edf5623`](https://github.com/cogenta-cms/cogenta/commit/edf562389652c4f6afb58d6e3f166de233d063e2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 15 — comments (ADR-0025, new contract F, `comments@1.0`):
  
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

- [`2fb2101`](https://github.com/cogenta-cms/cogenta/commit/2fb210109824f000788d512fef748f1066f65551) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the editorial site settings screen (fiche 23, ADR-0025's third settings
  category between `cogenta.config.mjs` — infrastructure, read-only — and
  `localStorage` — personal preference).
  
  - `@cogenta/schema` gains a typed key/value site-settings store
    (`createSiteSettingsStore`) backed by a closed registry: general (title,
    tagline, admin email, time zone, date/time style), reading (home path,
    posts per page), media (max upload size), and privacy (policy path, cookie
    banner). Every setting has a declared scope (site or per-locale), a default,
    and a required permission; writing an undeclared key is refused.
  - `@cogenta/api` gains `createSitePlanRouter`'s sibling `GET|PATCH
    /api/settings` and extends `GET /api/config-status` with `storage`,
    `llm`/`embeddings`/`imageGeneration`/`vector`, and `billingConfigured` —
    never a secret, never a credential.
  - `@cogenta/cli` wires the new store into `cogenta serve`/`dev`, and
    `theme-render.ts` now serves the configured home path instead of always
    falling back to the hardcoded `/home`.
  - `@cogenta/core` adds `SITE_SETTING_UNKNOWN`/`SITE_SETTING_INVALID` and a
    `secret-hygiene` module the settings screen uses to detect a
    `database.url` with embedded credentials, or a `.env` file readable by
    other users on shared hosting.
  - `create-cogenta` now writes the generated `.env` (which holds
    `COGENTA_AUTH_SIGNING_KEY`) with mode `0o600` instead of the default —
    closing the shared-hosting exposure `docs/hebergement-mutualise.md`
    already named as a known gap.
  
  The admin's old single-control "Paramètres" screen (the signed-in account's
  own interface language) moves to "My profile"; `/settings` is now the
  site-wide editorial screen.

- [`0e90b32`](https://github.com/cogenta-cms/cogenta/commit/0e90b32c19247430987e84cc1fd0be57e1ad4f3e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the "Santé" and "Outils" admin screens (fiche 24), maintenance mode, and a bounded server error journal.
  
  - `@cogenta/core`: adds `createErrorLog`, a bounded, redacted ring buffer for the last N server errors — the admin's substitute for reading `stdout` on a host with no access to the process.
  - `@cogenta/schema`: adds `createMaintenanceStore`/`ensureMaintenanceTable` (a one-row on/off switch with a visitor-facing message) and exports `reindexAll`/`reindexEntry` from the search indexer, so a full rebuild reuses exactly what the write path already does on save.
  - `@cogenta/api`: adds `createHealthRouter` (`GET /api/health-report` — literally `cogenta doctor`'s own report, over HTTP; migrations status/apply; audit chain integrity; disk usage; the error log; maintenance mode get/set) and `createToolsRouter` (`GET /api/tools`, `POST /api/tools/{id}/run`, `GET /api/tools/runs[/…]` — seven maintenance tools, always queued, never run inline in the request). Adds a `pending-migrations` notice source.
  - `@cogenta/cli`: `cogenta serve` wires all of the above — `runDoctor` reused unchanged, migrations applied only up to the first destructive one (the CLI is named for the rest), the seven tools (purge caches, reindex search/vectors, regenerate image variants, check links, test email, purge expired trash) running through the existing database-queue driver's degraded tier, and a maintenance-mode gate that serves an uncacheable 503 with a wait page to every anonymous visitor while `/api/*` and `/admin*` stay reachable.
  
  Purely additive: `createRequestListener`'s new third parameter is optional, and every `AssembleSiteOptions` addition is optional — a caller that builds a `Site` by hand, or does not pass a migrator, keeps working unchanged.

- [`bebbab8`](https://github.com/cogenta-cms/cogenta/commit/bebbab881761fb86a28cdbbcb95b5960429f2a29) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add store settings for the shop (fiche 34): tax zones/rates with a simulator, shipping
  zones/methods with a simulator, payment driver activation (presence-only for keys, never
  values), general store settings, and a configurable invoice template.
  
  - `@cogenta/core` gains a `payment` configuration section (`driver`, `testMode`,
    `manualInstructions`) following the exact `llm`/`billing` pattern: the Stripe secret key
    and webhook secret are never declared in the schema and are refused with
    `CONFIG_SECRET_IN_FILE` if written to `cogenta.config.mjs` — they come only from
    `COGENTA_PAYMENT_STRIPE_SECRET_KEY`/`COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET`.
  - `@cogenta/schema`'s site-settings registry (fiche 23) gains a `commerce` group
    (currency, tax-inclusive/exclusive display, countries served, minimum order, default
    backorder policy, ToS/return-policy page paths — pointers to real content entries, not
    text fields — and invoice series prefix/payment terms/language) and a new `select`
    `uiType` for closed-choice settings.
  - `@cogenta/commerce`'s admin router gains `GET|POST /tax/rules`, `DELETE
    /tax/rules/{id}`, `POST /tax/simulate` (calls the real resolver, never a second
    implementation), the shipping equivalents (`/shipping/methods`, `/shipping/simulate`),
    and `GET /payment/drivers` / `POST /payment/drivers/{name}/test-connection` (presence
    and live health only, never a key's value). `CommerceAdminRouterOptions` gains required
    `tax`/`shipping` fields and an optional `payment` field — **a breaking change** for any
    direct caller of `createCommerceAdminRouter` that does not yet pass them.
  - `@cogenta/cli`'s `cogenta serve` now selects a real payment gateway through
    `createPaymentRegistry` (Stripe when a key is configured and reachable, bank transfer
    otherwise) instead of a hardcoded manual gateway, and mounts the new commerce settings
    routes.
  - `@cogenta/admin` (private, no changeset) gains four screens under "Boutique": Tax,
    Shipping, Payment, and Store settings (general + invoice template), all `admin`-only.
  
  Deliberately not built in this fiche: an inbound `POST /api/commerce/payments/webhook`
  route. `PaymentStore.handleWebhook` is already implemented and tested; wiring it needs
  the raw (non-JSON-parsed) request body, which `cogenta serve`'s shared body reader does
  not yet support for any route. The payment screen shows the webhook URL a deployer would
  configure at Stripe, honestly labelled as not yet receiving events. See `BLOCKERS.md` §15.

- [`e75b23e`](https://github.com/cogenta-cms/cogenta/commit/e75b23ec985099f2eabe6eabb7b4c86115006996) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add global search: the ⌘K/Ctrl+K palette with shortcuts and "go to"/"create" actions, a full `/search?q=…` results page, highlighted excerpts, widened sources (orders, media, users, menus, extensions, taxonomy terms), typed inline filters (`status:draft`) and recent-search history (fiche 36).
  
  - `@cogenta/schema`'s search indexing (`extract.ts`) gains `buildExcerpt` — a window of prose
    around the first query term found, with match offsets scoped to that window, never the
    full text. Built from the *display* text (`SearchDocument.body`, never folded), so an
    excerpt keeps real casing and accents while still matching a folded, prefix-matching
    query.
  - `@cogenta/api`'s `search-router.ts` enriches each `SearchHit` with an excerpt built
    server-side, never reconstructed from HTML on the client (R3/R8: the excerpt is data,
    escaped at render).
  - `@cogenta/commerce`'s order store and admin router gain a search-by-number/email lookup,
    gated on the caller's own `commerce.read` permission — a source in the global search
    widens only what its own permission already allows, never more.
  - Admin: `shell/global-search.tsx` (palette, shortcuts, recent searches, inline-filter
    parsing), `routes/search.tsx` (the full results page, one tab per source with its own
    permission gate), `search/` (excerpt highlighting, inline-filter parser, recent-search
    `localStorage` store — never server-side, these are one person's own queries).

- [`e8061e2`](https://github.com/cogenta-cms/cogenta/commit/e8061e24ec41e9a99f5c852c28649f62656b0cc9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `ContentStore` gains `countByStatus()`, a real `GROUP BY status` count of a
  collection's live (non-trashed) entries. `ContentService` gains a matching
  `counts()`, and `GET /{collection}?counts=1` now returns a `counts` field
  alongside the page — a role that may not read unpublished content only ever
  gets the `published` count, never the others (not even as `0`).
  
  The server-side title fallback used for search results (`searchDocumentFor`)
  now checks fields named `title`, `name` or `label`, in that priority order,
  before falling back to the first declared `text` field — matching the same
  convention the admin's collection list, trash screen and relation picker
  already use for "what do we call this entry" (fiche 01, "Liste de contenu",
  task 1). This can change which text labels a search result for a collection
  whose first declared text field is not `title`.

- [`54409f3`](https://github.com/cogenta-cms/cogenta/commit/54409f3ff4640518d5d4149bef73a29142ba0d0a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Media library (fiche 11): tags, usage tracking, in-place replace, and richer
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

- [`2285720`](https://github.com/cogenta-cms/cogenta/commit/2285720ae29de05e96a8d776fd5ae14f2fe4fd0d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Menus gain a real editor (fiche `docs/plans/09-menus.md`):
  
  - **Edit an item in place.** `PATCH /api/menus/{id}/items/{itemId}` now accepts `label`, `kind`, the target fields, `title` and `openInNewTab` — no more delete-and-recreate to fix a typo. Changing `kind` clears the previous target rather than keeping a value that no longer applies. `parent` is deliberately not accepted here; re-parenting still goes through `POST .../move`.
  - **Bulk, transactional reorder.** `MenuStore.reorderItems` and `PATCH /api/menus/{id}/items` rewrite `parent`/`position` for any number of items in a single transaction, so a drag-and-drop or keyboard reordering session commits (or fails) as one unit — never a partially-rewritten tree if the network drops mid-session.
  - **Menu locations.** `Menu` gains `location: string | null` (`byLocation`, `GET /api/menus/by-location/{location}`) — where a menu renders (`primary`, `footer`, …), carried by the menu itself rather than baked into a theme's name convention. `@cogenta/cli`'s `ThemeRenderOptions` gains `headerMenuLocation`/`footerMenuLocation`, resolved generically by location with a fallback to the legacy `main`/`footer` name lookup, so an existing site's navigation keeps rendering unchanged. `@cogenta/core` gains the `MENU_LOCATION_TAKEN` error code for the one-menu-per-location-per-locale rule.
  - **Two new item kinds.** `taxonomy` (links to a term) and `home` (always resolves to `/`) join `entry`/`url`/`submenu-placeholder`.
  - **Target health.** A menu item resolver may now report `health` (`published`/`draft`/`scheduled`/`archived`/`trashed`) for an `entry` item — computed only for an actor whose role already has draft access to the target collection, so a public read never learns that a draft exists. `cogenta serve`'s public render hides a dead `entry`/`taxonomy`/`home` link entirely rather than serving one.
  
  All additions are backward compatible: `resolveEntry` gained a third `context` parameter and an optional `health` on its result, but a two-argument resolver still satisfies the type; every new field is optional or nullable on the wire.

- [`46572ba`](https://github.com/cogenta-cms/cogenta/commit/46572bae836b8182c2a3563e8f0e2da74d7e82ee) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the admin notification center (fiche 38): a bell with an unread count, filterable
  by severity/period, bulk mark-as-read; new notice sources (plugin auto-disabled,
  scheduled publication failed); channel-bridged notices reusing `@cogenta/channels`'
  existing message formats, grouping and identity-linking (no second mechanism); and a
  per-severity channel routing settings screen.
  
  `@cogenta/schema` gains `scheduled-publish-failures` store used by the new notice
  source. `@cogenta/api` gains a real `@cogenta/channels` dependency, new notice-router
  routes for channel settings and notice history, and a `plugin-disabled`/
  `scheduled-publish-failed` notice source pair. `@cogenta/plugins` exposes disabled-state
  data the new notice source reads. `@cogenta/channels`' preference types gain the field
  the settings screen needs.

- [`2c1af5d`](https://github.com/cogenta-cms/cogenta/commit/2c1af5d8ec08b460ba80a2228ceca6f4ff89eef2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 28 (tâches planifiées): a real scheduled-task registry and its admin
  screen — task 1 (registry) and task 2 (screen) complete and tested; task 4's
  concurrency-safe scheduled publication verified. `cogenta serve`'s own
  wiring of the registry, and the standalone `cogenta cron` command (task 5,
  for hosts with no permanent process), are **not done** — see below.
  
  - `@cogenta/schema`'s `ScheduledTaskRegistry` (`createScheduledTaskRegistry`):
    each task declares a name, description, interval and run function; the
    registry persists every run (`cogenta_scheduled_task_runs`) — last run,
    duration, outcome, error — so "did the trash sweep run last night" survives
    a restart rather than resetting with an in-memory timer. `overdue` is
    computed from that persisted timestamp (fiche 28's own named pitfall: a
    detector that lives in memory is blind exactly when a restart makes it
    matter).
  - `@cogenta/api`'s `createScheduledTasksRouter` (`GET /api/scheduled-tasks`,
    `GET .../{name}`, `POST .../{name}/run`, `GET .../queue`,
    `POST .../queue/{id}/retry`) — admin-only, thin read-through, "run now"
    never awaits its own audit write so a slow log never hangs the request.
  - `@cogenta/core`'s `QueueDriver` gains `list()`/`retry()` — the "file" section
    of the screen, and the way a failed maintenance job (fiche 24's queue) gets
    retried from the UI instead of a terminal.
  - `@cogenta/core`'s config gains `scheduler.mode` (`'internal'` |
    `'external-cron'`) and `backup.*` (interval/keep/dir) — resolved, defaulted,
    not yet consumed by `cogenta serve` (see below).
  - Admin: `/scheduled` (new nav entry, admin-only at the route level — R4, the
    nav link itself is not the gate) — task table with last run/duration/
    result/next run, an overdue badge, "run now" with a confirmation dialog for
    a `destructive` task (the trash sweep), a queue section with retry, and a
    pointer to the dashboard's own scheduled-content list rather than a second
    copy of it.
  
  **Genuinely not done, not just deferred quietly**: `cogenta serve` still
  drives scheduled publication, the trash sweep, the 404-log purge and the
  audit-integrity check on their own separate `setInterval`s, exactly as
  before this fiche — none of them are registered with the new
  `ScheduledTaskRegistry`. The registry and the admin screen above are real
  and fully tested against a registry populated by hand in their own test
  suites, but on a running `cogenta serve` today `/scheduled` would show an
  empty task list, because nothing calls `registry.register()` there yet.
  Wiring that in, and the `cogenta cron` command (task 5 — the fiche's own
  §8 leaves "deliver now or later" as an open decision), is real remaining
  work, not a rename or a config flag. Flagged here rather than left to be
  discovered later.

- [`745ebd8`](https://github.com/cogenta-cms/cogenta/commit/745ebd8f80ea94d916a370af0f9615e6565c0d00) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Editorial workflow and owner permission (`schema@2.1`, ADR-0027, fiche 37 + fiche 19
  task 5).
  
  Strictly additive — a site that never declares `workflow: { enabled: true }` on a
  collection, and never uses the `{ roles, own }` permission form, behaves identically
  to before this release. Proved by a compatibility test: a client reading only
  `status` gets byte-identical values.
  
  - `reviewState` (`none`/`pending`/`changes-requested`/`approved`) and
    `assignedReviewer` join the system fields, orthogonal to `status` — the same design
    ADR-0022 gave `deletedAt`. `approved` is not `published`: approving authorises,
    `publish` remains the action that makes an entry public.
  - A closed, server-side transition table (`submit`/`approve`/`requestChanges`), each
    gated by its own contract A action (`update` for submit, `publish` for the other
    two) — never duplicated by a client.
  - New `ContentStore` methods `submitForReview`/`approveReview`/`requestReviewChanges`/
    `assignReviewer`, and new REST routes `POST .../submit`, `.../approve`,
    `.../request-changes`, `.../assign-reviewer` — each its own path, never a second
    meaning for an existing verb (ADR-0022's own lesson for `purge`).
  - `CollectionPermissionRule` gains the object form `{ roles, own? }` alongside the
    plain role-name array, which stays valid. `own: true` scopes every listed role to
    entries the acting account created; `PermissionLayer.can()`/`.assert()` take an
    optional `ownerId` to check it.
  - Reversible, non-destructive migration (`schema21Migration`) adding `review_state`
    (`not null default 'none'`) and a nullable `assigned_reviewer` to every collection.
  - Admin: a review queue screen (three tabs — assigned to me / all pending / my
    submissions — aggregated server-side via a new `GET /api/review`), a pending-count
    nav badge, and an entry editor sidebar showing workflow state, assigned reviewer,
    and a contextual action button that replaces the absent Publish button with
    "Submit for review" for an actor without `publish`.
  
  Postgres/MySQL/MariaDB integration test files are written
  (`packages/schema/test/integration/schema-2-1-migration.test.ts`) but not executed
  this session — Docker unavailable; they skip loudly, naming the missing variable.

- [`9e67928`](https://github.com/cogenta-cms/cogenta/commit/9e67928b4b2fd58cc4e72f42f7a265aac8460567) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Taxonomy terms can now be edited (multi-locale labels, slug) and moved to a new parent without losing classification, per ADR-0022's materialised-path model. `GET /api/taxonomies/{name}` gains `?q=` (accent- and case-insensitive search), `?counts=1` (per-term entry counts, direct and with descendants) and `?unused=1` (terms nothing classifies), each permission-gated the same way ordinary content reads are. `countTaxonomyUsage` is a new export of `@cogenta/schema`.

- [`954460e`](https://github.com/cogenta-cms/cogenta/commit/954460e63748a58c47d28292b1691425775b7e36) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the translation dashboard (fiche 10 task 1) — everything needed to answer "what
  is still missing in each language" in one screen, without an `N × M` scan.
  
  `@cogenta/schema`'s `ContentStore` gains `translationsOfMany(rootIds)`: every
  working-state translation of a batch of root entries, in one query. A custom
  `ContentStore` implementation (uncommon — everyone else constructs one through
  `createContentStore`) needs to add it.
  
  `@cogenta/api`'s `ContentService` gains `translationMatrix(context, name, query)`,
  and REST gains `GET /{collection}/-/translation-matrix`: one row per root entry
  (`translationOf: null`), one cell per locale carrying its state (absent, draft,
  published, archived, scheduled) and, when the locale is a translation, whether the
  source changed since (`obsolete`) — a plain `updatedAt` comparison, stated as a fact
  rather than a verdict, per the fiche's own recommendation for signal (a). Requires the
  same `read` permission `GET .../translations` already does, plus the working-state
  gate; every row still passes the ordinary per-entry draft/preview gate.
  
  Honestly scoped: today's `PermissionLayer` has no per-locale permission, only
  per-collection — a role cannot be "denied French" independently of the collection
  itself. That is a permission-model change, not a dashboard change, and is
  deliberately out of this note's scope.

- [`3824e8e`](https://github.com/cogenta-cms/cogenta/commit/3824e8e043e5d4036a47bd1e0b9d86c44c45a5a7) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 06 (versions et historique): `diff.ts` gains `diffWords`, `extractPlainText` and
  `enrichWordDiffs` — a longest-common-subsequence word diff (R9: no diff dependency) that
  turns a `changed` `text`/`richText` field's before/after into the actual words that moved,
  rather than the flat "changed" a caller had to render on its own. `FieldChange` gains an
  optional `words` property carrying this — populated only by `enrichWordDiffs`, never by
  `diffValues`/`diffContent`/`diffBlocks` themselves, so the plain structural diff every
  existing caller (REST, and any agent tool built on `ContentStore.diff`) already relies on
  is unchanged unless it opts in.
  
  `@cogenta/api`'s `GET /{collection}/{id}/diff` now calls `enrichWordDiffs` on the store's
  result before returning it, so a corrected word in the admin's version history shows as a
  corrected word instead of "changed" (VersionHistory, `packages/admin`). Additive only: the
  response shape gains an optional field, no existing field changes meaning.

### Patch Changes

- [`f47e893`](https://github.com/cogenta-cms/cogenta/commit/f47e893b3e2b674b028af54d2146c7e83c32617c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `f.media({ many: true })` and `f.select({ many: true })` now actually store more than one
  value. Both options have existed on the public field constructors since contract A shipped,
  and `validation.ts` already validated an array against them (`manyOf`) — but
  `columnTypeFor`/`encodeFieldValue` treated every `media`/`select` field as a single scalar
  column regardless of `many`, so a genuine array threw `CONTENT_INVALID` ("expects a string,
  not object") the moment it reached the store. No site could ever have used either option
  successfully; this was found while wiring `@cogenta/admin`'s media and select field editors
  to a real gallery/many-choice UI, which needed the option to actually work.
  
  Fixed the same way a to-many `relation`/`taxonomy` field is fixed, minus the join table:
  neither `media` nor `select` has anything on the other end a foreign key could enforce (a
  media asset lives in its own subsystem; a select choice references nothing), so the ordered
  array is JSON-encoded straight into the field's own column instead — the same encoding
  `richText`/`json`/`geo` already use. An unset many-valued field now defaults to `[]`, never
  `null`, matching the same rule a to-many relation's empty case already followed.
  
  No migration: nothing could have written a value in the old shape (every write attempt threw),
  so there is no data to move.
- Updated dependencies [[`54ca689`](https://github.com/cogenta-cms/cogenta/commit/54ca6894449fcdd29ff76eef4514cda7c081f483), [`0692713`](https://github.com/cogenta-cms/cogenta/commit/06927130c15f7bc95ea97839cb50f67de87bd668), [`36744d3`](https://github.com/cogenta-cms/cogenta/commit/36744d3bc8e74a39fa6c68bdd78804fad1d8f069), [`0ca8a79`](https://github.com/cogenta-cms/cogenta/commit/0ca8a797288624a3c4d53ca0942687d9e570b186), [`c392e24`](https://github.com/cogenta-cms/cogenta/commit/c392e24880a29388fc63a08388042bf163817619), [`562c9c1`](https://github.com/cogenta-cms/cogenta/commit/562c9c1ee4d52b3e7f624e3b54ae033c2bd01e1c), [`edf5623`](https://github.com/cogenta-cms/cogenta/commit/edf562389652c4f6afb58d6e3f166de233d063e2), [`db307e0`](https://github.com/cogenta-cms/cogenta/commit/db307e068f4d029d98526c74d0ab9d56e531b73b), [`49815b9`](https://github.com/cogenta-cms/cogenta/commit/49815b95ad87cd37e7781cbb5a726327226259dd), [`122da7a`](https://github.com/cogenta-cms/cogenta/commit/122da7ad20396966b4d44538b0842f8efb9b7621), [`2fb2101`](https://github.com/cogenta-cms/cogenta/commit/2fb210109824f000788d512fef748f1066f65551), [`0e90b32`](https://github.com/cogenta-cms/cogenta/commit/0e90b32c19247430987e84cc1fd0be57e1ad4f3e), [`d0bfa1d`](https://github.com/cogenta-cms/cogenta/commit/d0bfa1d71166adfb0c66a296c4cf490ddd58a218), [`95acedf`](https://github.com/cogenta-cms/cogenta/commit/95acedf48920dba08e443e56ca4464bcfd394d34), [`6e5df34`](https://github.com/cogenta-cms/cogenta/commit/6e5df34e6f428c36712bc80e76c37d0cd7e33b1c), [`bebbab8`](https://github.com/cogenta-cms/cogenta/commit/bebbab881761fb86a28cdbbcb95b5960429f2a29), [`4513a71`](https://github.com/cogenta-cms/cogenta/commit/4513a71a15dfa7a716bf9c8fcd02f93df927f230), [`54409f3`](https://github.com/cogenta-cms/cogenta/commit/54409f3ff4640518d5d4149bef73a29142ba0d0a), [`2285720`](https://github.com/cogenta-cms/cogenta/commit/2285720ae29de05e96a8d776fd5ae14f2fe4fd0d), [`2c1af5d`](https://github.com/cogenta-cms/cogenta/commit/2c1af5d8ec08b460ba80a2228ceca6f4ff89eef2), [`745ebd8`](https://github.com/cogenta-cms/cogenta/commit/745ebd8f80ea94d916a370af0f9615e6565c0d00)]:
  - @cogenta/core@0.5.0

## 0.3.0

### Minor Changes

- [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Navigation menus, missing entirely until now — no backend, no admin, no theme wiring — and
  a P0 gap for a CMS meant to compete with WordPress/Strapi/Drupal.
  
  `@cogenta/schema` gains `createMenuStore`/`ensureMenuTables`: a menu is a named tree of
  items (`entry` — a link to a real collection entry, `url` — an external link, or
  `submenu-placeholder` — a heading with no target of its own), structurally close to a
  taxonomy term tree (materialised path, reusing `taxonomy-path.ts`'s helpers as-is) but
  **not** a `TaxonomyStore`: a menu is created and edited entirely at runtime from the admin,
  never declared in a site's schema module, so it gets one fixed pair of tables
  (`cogenta_menus`/`cogenta_menu_items`) rather than one table per declared name. A menu
  belongs to a locale the same way a localised collection does (ADR-0014) — two menus named
  `main` can coexist, one per locale, never one row trying to carry both. New error codes:
  `MENU_UNKNOWN`, `MENU_NAME_TAKEN`, `MENU_ITEM_NOT_FOUND`, `MENU_ITEM_INVALID`,
  `MENU_CYCLE`.
  
  **One real bug found and fixed while building this**: a materialised path is id-based, so
  two siblings' paths diverge at their own id — sorting a listing by `path asc, position asc`
  (`taxonomy-store.ts`'s own pattern) therefore sorts siblings by *creation order*, never by
  `position`, silently defeating any "move up/down" a caller might build on top of it. The
  menu store walks the tree in application code instead (group by parent, sort each group by
  `position`, depth-first from the roots) — cheap for something the size of a navigation
  menu, and it is what makes `reorderItem` (swap with the sibling before/after) actually work.
  
  `@cogenta/api` gains `createMenuRouter`: `GET /api/menus` and `GET /api/menus/{id}` are
  public (a menu serves the public theme's navigation, same as a published entry); every
  write requires `admin` or `editor` — a fixed rule, not a per-site permission
  configuration, since a menu is neither a collection nor a taxonomy and giving it a third
  `PermissionLayer` method for one rule that never varies would be new surface for nothing.
  `GET /api/menus/by-name/{name}?locale=` resolves a menu the way a theme will want to
  (refusing ambiguity across locales without `?locale=`, rather than guessing). An `entry`
  item is optionally resolved to a display label and public route via an injected
  `resolveEntry` callback, kept out of the router itself so it stays decoupled from content
  resolution.
  
  `cogenta serve` mounts `/api/menus/*`, resolving `entry` items through the same
  permission-checked `ContentGateway` and `buildPath` the theme renderer uses, as `ANONYMOUS`
  (a menu is public navigation — an item never resolves to more than an anonymous visitor
  could see). The admin gains a `/menus` screen (menu selector, item list with up/down
  reorder buttons and delete, add-item form for a URL or a collection+entry), kept plain like
  `taxonomies.tsx` — L11 owns how the admin looks; every action goes through the real API and
  write controls only render for `admin`/`editor` (the server refuses the rest regardless,
  R4).
  
  **What is not done, and why**: theme rendering (a public page actually showing a menu) is
  out of scope for this change — see `BLOCKERS.md` for the exact point to wire it in
  (`packages/theme-canonical/src/Base.astro`'s header/footer slots, fed by
  `GET /api/menus/by-name/{name}`). Nothing here touches contract A or B: a menu is
  deliberately not content and not a block.

- [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Scheduled publication, written and tested since L1 (`@cogenta/schema`'s
  `schedulePublication`/`registerScheduledPublishing`, a `QueueDriver`-based mechanism with
  a real degraded `database` driver) but never wired to anything: an editor could set an
  entry to "Scheduled" with a future date and nothing would ever happen — the admin showed
  it as a read-only badge, honest about the gap rather than lying about it.
  
  **The missing link was the write path, not the queue.** `ContentStore.update()` never
  changes `status` (contract A keeps that transition to `publish`/`unpublish`), so there was
  no way to move an *existing* entry into `scheduled` at all — only `create({status:
  'scheduled', ...})` worked. `unpublish()` now also accepts `status: 'scheduled'` with a
  required `publishedAt` (a `Date`, an ISO string, or epoch milliseconds), writing it as an
  ordinary value of the collection's own `publishedAt` field the same way `publish()`
  already does. A collection that never declared `publishedAt` refuses with
  `CONTENT_SCHEDULE_INVALID` rather than accepting a schedule with nowhere to put the date.
  
  `@cogenta/schema` gains `withScheduledPublishEnqueue`, a `ContentStore` decorator in the
  same family as `withSearchIndexing`/`withLifecycleEvents`: wrapping `create`/`update`/
  `unpublish`/`restore`, it calls `schedulePublication` whenever the result is
  `status: 'scheduled'`. It re-enqueues on every save rather than tracking a previous job
  id — safe, because the handler re-reads the entry before publishing and skips anything no
  longer `scheduled` (an edit back to `draft`, or a manual publish that already happened).
  
  `@cogenta/api`'s `POST /{collection}/{id}/unpublish` accepts
  `{"status": "scheduled", "publishedAt": "…"}` alongside the existing `draft`/`archived`.
  
  `cogenta serve` creates a `database`-backed `QueueDriver` per site (R1: no external
  worker, no Redis — a table in the site's own database, drained in-process) and registers
  the publish handler once, at `assembleSite`. `runServe` drains it on a `setInterval` —
  once immediately at startup to catch up on anything overdue, then every 60 seconds for as
  long as the process runs. The trade this makes, and the one worth knowing: a page
  scheduled for 09:00 goes live between 09:00 and 09:01, and if the process is down when
  09:00 comes, nothing is lost — the job is still in the table — it simply runs late, on
  the first tick after the next start.
  
  Not a CLI flag: `ServeOptions.scheduledPublishTickMs` overrides the cadence for tests
  only (proving the loop really drains the queue without waiting a real minute for it); an
  operator has no reason to touch it.
  
  The admin's status control gains a real `datetime-local` picker (never free text),
  offered whenever the collection declares `publishedAt`: "Programmer"/"Reprogrammer" call
  the new `unpublish` shape, and "Annuler la programmation" moves a scheduled entry back to
  draft.

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0

## 0.2.0

### Minor Changes

- [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Detect broken links across published content (L14 task 3)
  
  `@cogenta/schema` gains `extractLinks` and `checkLinks`, and `@cogenta/cli`
  gains `cogenta links check` to run them over a real site.
  
  The crawl walks every published entry, collects every link it holds — a
  rich-text `markDefs` href, a contract B action `target`, a plain `url` field —
  and reports the ones that lead nowhere, telling apart a target that was
  deleted, one that exists but is not published, a path no route can serve, and
  a reference to a collection the site does not have. Each distinct target is
  resolved once however many entries point at it.
  
  Two deliberate limits, both documented in the code:
  
  - **External URLs are opt-in** (`--external` / `checkExternal`). A HEAD that
    comes back 403 or 405 is retried as a GET, because plenty of hosts refuse
    HEAD on pages they serve happily.
  - **Nothing schedules itself.** Rule R1 guarantees no durable worker, so
    "periodically" is a cron entry calling the command, not a scheduler
    pretending to exist inside the site. `cogenta links check` exits 1 when it
    finds something, so it works as a CI or cron check.
  
  Note: the full-text index is not reused for this, as the lot suggested it
  might be — `search/extract.ts` deliberately strips `href`, `url` and
  `markDefs` before indexing, so it holds no URL at all.

- [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Send a real signed webhook when content is published (L14 task 1)
  
  The signed outbound webhook channel has existed since L6 and nothing ever
  called it. It is now connected to the content lifecycle.
  
  - `@cogenta/channels` gains `createWebhookEventSender`, which POSTs a
    structured `{ event, occurredAt, data }` envelope to every configured
    endpoint. It reuses `signOutgoingWebhook` and the existing
    `X-Cogenta-Timestamp` / `X-Cogenta-Signature` headers **verbatim**, so a
    receiver verifies an event with `verifyIncomingWebhook` exactly as it
    verifies a message — there is no second signing path. It never throws: a
    failed delivery comes back as a result to log, so an editor's publish is
    never lost to somebody else's downtime.
  - `@cogenta/schema` gains `withLifecycleEvents`, a `ContentStore` decorator in
    the same shape as `withSearchIndexing`. It emits `content.publish` (from
    `publish()`, and from `create()` with a published status),
    `content.unpublish` and `content.delete`, each carrying the entry's
    identity, status, timestamps and its real route path from `buildPath`.
    Draft edits emit nothing. The event body never carries the content itself.
  - `@cogenta/core` gains a `webhooks.endpoints` config section. The signing
    secret is environment-only (`COGENTA_WEBHOOK_SECRET`, rule R7); endpoints
    configured without it disable delivery with a startup warning rather than
    falling back to unsigned requests.
  - `cogenta serve` wires the two together, outermost of all store decorators so
    an event only describes a write that really landed.
  
  Proven end to end by a suite that publishes over real HTTP and verifies the
  signature on the bytes a real `node:http` receiver got off the socket.

- [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Breaking: contract A moves to `schema@2.0`** (ADR-0022) — the trash and native
  taxonomies, in one version bump with one migration.
  
  ### `delete()` changed meaning without changing signature
  
  `ContentStore.delete()` no longer issues a `DELETE`. It writes the new system
  field `deletedAt` and leaves every row where it was — versions, blocks, join
  rows, and the `translation_of` of any translation. Two new methods complete it:
  
  - `purge(id)` is the real `DELETE`, i.e. what `delete()` used to do;
  - `untrash(id)` takes an entry back out, with the status it went in with;
  - `purgeExpired()` removes what has outlived the collection's `trash.retainDays`.
  
  **How to migrate.** Code that called `delete()` to genuinely destroy a row — an
  import script that cleans up, a test that resets — must now call `purge()`.
  Nothing will fail loudly if you do not: the call still succeeds and simply
  leaves the row behind, which is the worst kind of break and the reason it is
  called out first here. `trash: false` on a collection restores the old
  behaviour outright.
  
  ### Every read now filters the trash by default
  
  `read`, `list`, `translations`, `resolveLocale` and `history` exclude trashed
  entries unless the caller passes `trashed: 'include' | 'only'`. That direction
  is deliberate: a renderer, a sitemap or a headless client written against 1.0
  keeps serving live content with no change at all.
  
  ### `restrict` is now enforced in application code
  
  Trashing is an `UPDATE`, so a foreign key can no longer refuse it. `delete()`
  checks referring entries itself and names what blocks ("2 entries of
  \"article\" still reference it"); `purge()` runs the same check so both paths
  give the same sentence. This needs the sibling collections, so
  `createContentStore` takes a new optional `siblings` option — **pass it**. Left
  out, only self-references are checked; nothing is destroyed, since `purge()`
  still meets the real foreign key, but a trash that should have been refused
  will be allowed.
  
  `withReadOnlyStore` refuses `delete`, `untrash`, `purge` and `purgeExpired`.
  
  ### Native taxonomies
  
  `defineTaxonomy()` is a second top-level declarable object beside
  `defineCollection()`, and `f.taxonomy({ of, many })` a new field kind. A term
  carries `id`, `parent`, `slug`, `position` and `labels` indexed by locale, and
  deliberately no `status`, `version` or `translationOf`: a classification is not
  content, so ADR-0014 does not govern it.
  
  The tree is stored as a **materialised path** maintained on write, never a
  recursive CTE: "everything under this term" is one `like` that Postgres,
  MySQL/MariaDB and SQLite answer identically (ADR-0006). Paths are built from
  ids, so renaming a term rewrites nothing and only a move pays. Nesting is
  bounded at 12 levels so the indexed column stays inside InnoDB's key limit.
  
  `createTaxonomyStore()` is the term store; `createSchemaTables(db, collections,
  taxonomies)` and `dropSchemaTables` take the taxonomies as a third argument.
  
  ### The migration
  
  `schema2Migration({ collections, taxonomies })` adds `deleted_at` to every
  entry table and creates the terms and join tables. It is marked **destructive**,
  so the migrator demands an explicit confirmation and a verified backup: its
  `down` drops `deleted_at` and the terms tables, which permanently discards
  everything in the trash and every classification — entries sitting in the trash
  silently become live again with no record they were ever deleted.
  
  ### Also
  
  `.cogenta/schema.json` reports `schema@2.0`, carries the declared taxonomies and
  each collection's trash window, and `buildSchemaDocument`/`renderSchemaJson`
  take the taxonomies. `@cogenta/core` gains the error codes the two features
  need: `CONTENT_REFERENCED`, `CONTENT_NOT_TRASHED` and the `TAXONOMY_*` family.

- [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `ContentStore` gains `duplicate(id, input?)`: it copies an entry's values,
  relations and block zones into a brand-new draft (L13 task 4). No contract A
  change — it composes `read` and `create`, and duplication is covered by the
  already-frozen `create` action, so no sixth permission action was invented.
  
  Four behaviours are decisions rather than defaults, and each is tested:
  
  - **The copy always starts its own translation family** (`translationOf` is
    null even when the source is itself a translation). Two rows of the same
    family sharing a locale would make `resolveLocale` choose between them
    arbitrarily — it returns the first match — and would list the copy in
    `translations()` as if it were another language.
  - **A unique field gets a derived, free value** (`sido` → `sido-copy` →
    `sido-copy-2`), probed inside the same transaction as the insert. Without
    it the first duplicate of the commonest collection shape there is — an
    article with a unique slug — would fail on a raw unique-index violation. A
    unique field that is not text cannot be derived, and refuses with
    `CONTENT_INVALID` naming the field instead of guessing.
  - **Copied blocks get fresh `_key`s.** A key anchors comments and RAG chunks;
    the same key in two entries would make a key alone meaningless as an anchor.
  - **Provenance is carried over, not reset to `human`.** Duplicating generated
    content does not make it human-written. Pass `provenance` to say otherwise.
  
  `publishedAt` is always cleared, the copy is always a `draft` at version 1
  with its own empty history, and it copies the **working** state — what the
  editor is looking at — not the published version underneath.
  `withReadOnlyStore` refuses `duplicate` like every other mutation.

- [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Full-text search is reachable for the first time (L10 task 3). The engine
  (`packages/schema/src/search/`, one driver per database) has existed and
  been tested since L1, but nothing anywhere in the repository ever called
  `index()` and no route ever called `search()` — so every search returned
  nothing, however the query was written.
  
  - **`@cogenta/schema`** gains `withSearchIndexing(store, { collection,
    index, onError })`, a `ContentStore` decorator in the same shape as
    `withReadOnlyStore`. Wrapping the store rather than hooking a router is
    what makes REST and GraphQL both covered by one guard instead of two.
    Its central safety property: after any mutation the **published** face is
    read back first and indexed when it exists, so an unpublished edit to a
    published entry can never be filed under a status a public search reaches.
    A failing index write never fails the content write — the index is derived
    data — and surfaces through `onError` rather than silently.
  - **`@cogenta/api`** gains `createSearchRouter` — `GET /api/search?q=…`,
    with `collections`, `status`, `locale`, `limit` and `offset`. Naming a
    collection you may not read is a 403, not a quieter answer; the default
    scope is the readable collections only, and every hit is filtered against
    that same set on the way out. `status` other than `published` requires
    `canReadUnpublished` on every collection in scope.
  - **`@cogenta/cli`** creates the index at startup, wraps every collection's
    store with it, mounts `/api/search`, and serves a public `/search?q=…`
    page with a real form and real links (`noindex`, as a search results page
    must be). The public page is a **route, not a contract B block**: contract
    B is frozen and adding a block needs an RFC, which does not belong in a
    lot whose premise is "wiring only".

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0

## 0.1.0

### Minor Changes

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the core of `@cogenta/schema`: `defineCollection`, the fourteen field types of
  contract A, the system fields, and the two generated artefacts.
  
  `f.text()`, `f.richText()`, `f.slug()`, `f.number()`, `f.boolean()`, `f.date()`,
  `f.datetime()`, `f.media()`, `f.relation()`, `f.select()`, `f.json()`, `f.geo()`,
  `f.color()` and `f.blocks()` each produce a plain, serialisable field definition and a
  Zod validator derived from it — one validator, generated from the schema, never a second
  one written by hand next to it.
  
  `defineCollection` checks a definition at import time and reports **every** problem at
  once, each located by the field it concerns (`fields.author.onDelete`,
  `indexes[0]`, `routing.pattern`), rather than one per run. A default value the field
  itself would reject, a slug derived from a field nobody declared, `'setNull'` on a
  required relation, an action outside the five of the contract: all refused before a
  migration exists.
  
  `renderTypeDeclarations()` produces `.cogenta/types.d.ts` — one interface per collection,
  extending the system fields, importing nothing so a theme compiles against it without
  depending on the schema package. A theme reading a field that no longer exists now fails
  to build, which is the acceptance criterion of L1. `renderSchemaJson()` produces
  `.cogenta/schema.json`, the description the admin reads. Both are pure functions
  returning strings; the CLI writes the files.
  
  `richText` stores the restricted Portable Text document of ADR-0013 — no HTML, no `h1`,
  internal links referencing an entity rather than a URL — and rejects a mark that no
  `markDefs` entry defines or two nodes sharing a `_key`. Ids are application-minted
  UUIDv7 (ADR-0015), monotonic inside a millisecond so they stay ordered.
  
  Core gains the `SCHEMA_INVALID` error code.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add slugs, routing, automatic 301 redirects and scheduled publication to `@cogenta/schema`.
  
  **Slugs.** `slugify` transliterates with `normalize('NFD')` and a written-down table for
  the letters Unicode does not decompose — "ß", "æ", "ø" — so it needs no dependency and no
  data file. `deriveSlug` reads the source named by `f.slug({ from: 'title' })`, keeps a
  slug the editor typed by hand, and resolves collisions with a `-2`, `-3` suffix that
  stays inside the length budget rather than growing past the column width. Uniqueness is
  scoped **per collection and per locale**, which is what ADR-0014 implies: the French and
  the English article are two entries, and both are legitimately `/mon-article` under their
  own prefix.
  
  **Redirects.** Changing the slug of a **published** entry now writes a 301 with nobody
  asking for it, and the table is listable, filterable and deletable. Two properties are
  enforced at write time rather than left to whoever reads the table later:
  
  - chains are flattened — renaming a page twice leaves one hop, not two, so a visitor
    never pays for the site's edit history;
  - loops are refused with `CONTENT_REDIRECT_LOOP`, and moving a page back to its old URL
    is expressed as `release()` rather than as a cycle the store quietly repairs.
  
  A draft that changes slug records nothing: nobody could reach the old URL, and a redirect
  from an unreachable path is a row that only ever confuses.
  
  **Routing.** `matchPath` resolves a URL against `routing.pattern`, with or without the
  locale prefix, and `buildPath` goes the other way. `resolveUrl` answers `entry`,
  `redirect` or `notFound` — content first, redirects second, so a stale rule can never
  shadow a page that is live.
  
  **Scheduled publication.** An entry in `status: 'scheduled'` becomes a job in the L0
  queue, and the whole module is written against `QueueDriver` and nothing else. It
  therefore works on the `database` queue — the driver with no worker of its own, drained
  by a cron calling `tick()`. On a cron every five minutes, a page scheduled for 09:00 goes
  live between 09:00 and 09:05; that is the honest promise of a host without a worker, and
  the handler logs the lateness so the question can be answered when it is asked. An entry
  whose hour passed while the site was down publishes on the next tick instead of being
  skipped.
  
  `@cogenta/core` gains five error codes for the above: `CONTENT_SLUG_INVALID`,
  `CONTENT_SLUG_TAKEN`, `CONTENT_ROUTE_INVALID`, `CONTENT_REDIRECT_LOOP` and
  `CONTENT_SCHEDULE_INVALID`. Adding a code is a minor change; no existing code changed
  meaning.

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the content persistence layer: typed CRUD, drafts, versions, diff and i18n, portable
  across Postgres, MySQL, MariaDB and SQLite.
  
  `createContentStore({ db, collection })` gives a collection its create/read/update/
  delete/list, plus `publish`, `unpublish`, `history`, `readVersion`, `restore`, `diff`,
  `translations` and `resolveLocale`. `createSchemaTables(db, collections)` builds the
  physical schema the store expects — the same DDL the migration generator will emit, so
  the two cannot drift.
  
  The entry table holds the **live** state, which is what the public renderer reads. With
  `versioning.drafts`, editing a published entry writes a version row and leaves the live
  row alone: a draft is unreachable through `read(id)` because it is not there, not
  because a filter remembered to exclude it. Publishing moves the live row onto the
  working version. `versioning.keep` bounds the history, and the live version is never
  pruned.
  
  Pagination is by keyset cursor, never by offset: a cursor is the sort value and the id of
  the last row handed out, so entries inserted concurrently cannot shift a window and make
  a reader see the same entry twice or miss one. A cursor taken under one ordering is
  refused under another.
  
  Identifiers are UUIDv7 minted by the application (ADR-0015) — no `RETURNING`, no
  `insertId`, and content keeps its identity across dev, staging and production. Blocks are
  one row each, ordered, with a stable `_key` (contract A), so "which pages use this
  medium", cache-tag invalidation and per-block RAG chunking stay possible. Content is one
  entry per language (ADR-0014): `status`, `publishedAt` and `version` are per language,
  and a missing locale renders through one of three explicit strategies — show the
  original, hide it, or report it missing.
  
  Core gains three error codes — `CONTENT_NOT_FOUND`, `CONTENT_INVALID` and
  `CONTENT_CONFLICT` — so the content layer reports what failed with a code callers can
  branch on, instead of borrowing `CONFIG_INVALID` for an editor's mistake.

- [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `GET /{collection}/{id}/translations`, listing every live entry of the
  translation family an id belongs to (ADR-0014: one entry per language,
  linked by `translationOf`) — itself included, gated the same way `history`
  already is (only an actor who may read this entry's working state may
  enumerate its family).
  
  `buildSchemaDocument` accepts an optional second `site` argument
  (`{locales, defaultLocale}`), included in the document only when given —
  `.cogenta/schema.json`'s own build-time call is unaffected. `cogenta serve`
  now passes it through to `/api/schema`, so the admin can render a locale
  switcher without hardcoding assumptions about which locales a site has.
  
  Fixed along the way: `cogenta serve` was hardcoding `locales: ['en']`,
  `defaultLocale: 'en'` into the content service's routing options instead of
  reading `config.site.locales`/`defaultLocale` — a site configured for more
  than English silently only ever routed English. `translationOf` on create
  was already fully wired end to end (REST body → `ContentStore.create`); no
  change was needed there.

### Patch Changes

- [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/auth` — passwords, TOTP, WebAuthn passkeys, opaque sessions, progressive
  login rate-limiting, and a hash-chained audit log, tested against a real SQLite database
  (no mocked database, per AGENTS.md).
  
  Passwords use `scrypt` from `node:crypto` at the OWASP floor (N=2^15), never bcrypt or
  argon2 — both are native modules R10 forbids without a WASM fallback, and neither ships
  one. TOTP (RFC 6238) is hand-written, forty lines of unambiguous HMAC; WebAuthn is a
  justified dependency (`@simplewebauthn/server`, MIT, pure JS) because attestation
  verification is a large, security-relevant surface no homegrown subset should touch.
  
  MFA is mandatory, not configurable, for the `admin` role and for any role a collection
  grants `publish` to — computed from `CollectionDefinition[]`, so it tracks the schema
  rather than a setting someone can switch off under deadline pressure. A short-lived
  HMAC-signed ticket (the same shape as a preview grant) carries a verified password step
  into the second-factor step without server-side state.
  
  Sessions are opaque random bearer tokens, stored hashed like a password, sliding TTL —
  never a JWT, so "sign out of every device" is a real revoke rather than a wait for
  expiry. The audit log is append-only and hash-chained; `verify()` detects a row edited or
  deleted outside of `record()`, and this table is built to take a second writer once L4's
  agents need to log to the same place.
  
  `newId`/`isUuidV7`/`timestampOf` move from `@cogenta/schema` to `@cogenta/core`, since
  `@cogenta/auth` now needs them too; `@cogenta/schema` re-exports them unchanged.

- [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fixes a silent export collision: two unrelated types were both named
  `ContentBlock` in `@cogenta/schema`'s public surface — the store's
  `key`/`type`/`data` row shape (`store/types.ts`, backing `BlockZones` and
  `ContentEntry`), and the raw `_key`/`_type` wire-validation shape a `blocks`
  field write is checked against (`validation.ts`). Because an explicit named
  export wins over an `export *` re-exporting the same name, the validation
  shape silently shadowed the store shape — any consumer importing
  `ContentBlock` got the wire shape, with no way to reach the store shape
  under that name at all.
  
  The validation shape is renamed `RawBlockInput`. `ContentBlock` now
  unambiguously refers to the store's row shape, matching what `BlockZones`
  and `ContentEntry` already exposed. No wire or storage shape changed — this
  is a TypeScript type-alias rename only, and no consumer in this workspace
  was importing the shadowed name (`packages/admin`, `packages/render` and
  `packages/import` each already used their own local, structurally
  equivalent type rather than this ambiguous export).
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
