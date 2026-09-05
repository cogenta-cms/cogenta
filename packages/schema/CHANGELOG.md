# @cogenta/schema

## 0.4.0

### Minor Changes

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
- 5c5ffbd: L21 task 2 — a runtime template + personalisation system for the admin's
  own interface, the counterpart `packages/admin/src/routes/appearance.tsx`
  already gave the public site (contract D) but the admin itself never had:
  before this, `theme.css` was a single hard-coded design with no selector
  and no override mechanism at all.
  
  **`@cogenta/core`:** two new error codes, `ADMIN_THEME_TEMPLATE_UNKNOWN`
  and `ADMIN_THEME_INVALID`.
  
  **`@cogenta/schema`:** a new `admin-theme-templates.ts` — two complete,
  built-in token sets (`ADMIN_THEME_TEMPLATES`): "Nightops" (the current
  dark-first, signal-green console — copied verbatim from `theme.css`) and
  "Atelier" (the warm, printed-paper design that shipped immediately before
  the Nightops reskin, recovered from git history rather than approximated
  from memory) — plus `adminThemeOverridesSchema`, the small, curated set of
  personalisation levers a template can be customised with (primary/
  background/text colour, display font, body font, corner radius, an
  optional logo media id) without ever rewriting the built-in template
  itself. `ensureAdminThemeTable`/`createAdminThemeStore` persist exactly one
  choice (a template id plus its overrides) in a new fixed table
  (`cogenta_admin_theme`, the same one-table-no-migration-file treatment
  `menu-tables.ts`/`site-settings-tables.ts` already use for admin-editable,
  non-schema-declared state).
  
  **`@cogenta/api`:** `createAdminThemeRouter` — `GET|PUT /api/admin-theme`.
  Read needs no session at all (the admin's own `/login` screen has to paint
  in the chosen template before one exists); write needs the `admin` role,
  checked by the router itself.
  
  **`@cogenta/cli`:** `cogenta serve` mounts the new store and router, and
  audits every successful `PUT` the same way `/api/settings` already does.
  
  No breaking changes — a site that never calls `PUT /api/admin-theme` keeps
  `theme.css`'s own "Nightops" defaults exactly as before. `@cogenta/admin`
  (private, no changeset) gains the settings screen ("Apparence de l'admin",
  deliberately a separate nav entry from the public site's own "Apparence"),
  `AdminThemeProvider` (injects the computed CSS as a `<style>` tag,
  cascading over `theme.css`'s own tokens), and a personalised logo in the
  top bar when one is set.
- a2516aa: The built-in "Nightops" admin theme template is redesigned: a dark navy navigation rail in both colour schemes, one electric-indigo accent (deepened on light, brightened on dark), cooler surfaces, softer corner radii. Token names and the template id are unchanged; an install that personalised Nightops keeps its overrides.
- 23299e9: The assistant's vector index is now explained and manageable, not just a raw
  count (L22 task 4).
  
  - `GET /api/assistant` now reports, per content collection, whether it is
    included in the index and how many chunks it contributes
    (`vector.collections`), plus the reserved pseudo-collection name reference
    documents are stored under (`vector.referenceCollection`).
  - A new site setting, `assistant.indexedCollections` (`GET|PATCH
    /api/settings`, `admin` only), lets an operator exclude a collection —
    published articles included — from the index. The change is read live: it
    applies on the next content save, with no restart, and the existing
    "Reindex vectors" tool applies it to already-indexed content.
  - A document upload flow — `GET/POST /api/assistant/documents` and `DELETE
    /api/assistant/documents/:id` — lets an admin add reference material (PDF,
    DOCX, Markdown, plain text) to the same index the site's own content feeds,
    reusing the existing `document.extract_text` → `chunkDocument` →
    `EmbeddingProvider.embed` pipeline rather than a second one. Each document
    tracks its own `pending`/`indexed`/`error` state.
  - `@cogenta/agents` gains `createReferenceDocumentStore`,
    `ingestReferenceDocument`/`removeReferenceDocumentVectors`, and the
    `REFERENCE_DOCUMENT_COLLECTION`/`REFERENCE_DOCUMENT_LOCALE`/`REFERENCE_DOCUMENT_STATUS`
    constants a caller needs to retrieve them (e.g. via `assist.chat`'s
    `collections` input).
  - `@cogenta/core` gains one error code, `ASSIST_DOCUMENT_NOT_FOUND` (404).
  
  All of this is additive and degrades the same way the rest of L18 does: a
  site with no embeddings provider gets none of it, and every other feature
  works unchanged (R2).
- 916ef34: Fiche 59 (canaux : guides pas-à-pas) — `SITE_SETTINGS_REGISTRY` gains a new `channels`
  group with three free-text, non-secret entries (`channels.telegramBotName`,
  `channels.slackBotName`, `channels.discordBotName`), each admin-writable and site-scoped.
  This is what lets the admin's "Canaux" screen name a linked bot in its new step-by-step
  "How does this work?" guide instead of a generic placeholder — the bot's real credential
  (the token) is still environment-only (R7) and has no row anywhere in this registry or its
  backing table.
  
  Additive only: a new registry entry with an existing `uiType` (`string`) needs no change
  to `SiteSettingsStore`, the REST router, or the generic settings-field renderer — the same
  "add a setting = one declaration" property `SITE_SETTINGS_REGISTRY` has held since fiche 23.
- 7b7ec0b: Add `ContentStore.count()` — a single `GROUP BY status` plus a trash count,
  never a page scanned client-side — and `ContentService.summary()` /
  `GET /-/summary` on top of it: one request that answers every collection an
  actor may read with its status counts (`draft`/`scheduled`/`published`/
  `archived`/`trashed`/`total`), each figure `null` rather than a fabricated
  `0` when the actor may not read that collection's unpublished rows or its
  trash. This is the shared implementation the admin's dashboard content
  summary widget and the collection list's status tabs both build on. Purely
  additive: no existing method, route or response shape changes.
- 0ca8a79: Add optimistic concurrency detection and per-field error naming for the entry editor (fiche 02, tasks 3 and 7).
  
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
- c392e24: Redirects: 404 log, prefix patterns, editing, CSV import/export, automatic
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
- 2fb2101: Add the editorial site settings screen (fiche 23, ADR-0025's third settings
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
- 0e90b32: Add the "Santé" and "Outils" admin screens (fiche 24), maintenance mode, and a bounded server error journal.
  
  - `@cogenta/core`: adds `createErrorLog`, a bounded, redacted ring buffer for the last N server errors — the admin's substitute for reading `stdout` on a host with no access to the process.
  - `@cogenta/schema`: adds `createMaintenanceStore`/`ensureMaintenanceTable` (a one-row on/off switch with a visitor-facing message) and exports `reindexAll`/`reindexEntry` from the search indexer, so a full rebuild reuses exactly what the write path already does on save.
  - `@cogenta/api`: adds `createHealthRouter` (`GET /api/health-report` — literally `cogenta doctor`'s own report, over HTTP; migrations status/apply; audit chain integrity; disk usage; the error log; maintenance mode get/set) and `createToolsRouter` (`GET /api/tools`, `POST /api/tools/{id}/run`, `GET /api/tools/runs[/…]` — seven maintenance tools, always queued, never run inline in the request). Adds a `pending-migrations` notice source.
  - `@cogenta/cli`: `cogenta serve` wires all of the above — `runDoctor` reused unchanged, migrations applied only up to the first destructive one (the CLI is named for the rest), the seven tools (purge caches, reindex search/vectors, regenerate image variants, check links, test email, purge expired trash) running through the existing database-queue driver's degraded tier, and a maintenance-mode gate that serves an uncacheable 503 with a wait page to every anonymous visitor while `/api/*` and `/admin*` stay reachable.
  
  Purely additive: `createRequestListener`'s new third parameter is optional, and every `AssembleSiteOptions` addition is optional — a caller that builds a `Site` by hand, or does not pass a migrator, keeps working unchanged.
- bebbab8: Add store settings for the shop (fiche 34): tax zones/rates with a simulator, shipping
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
- e75b23e: Add global search: the ⌘K/Ctrl+K palette with shortcuts and "go to"/"create" actions, a full `/search?q=…` results page, highlighted excerpts, widened sources (orders, media, users, menus, extensions, taxonomy terms), typed inline filters (`status:draft`) and recent-search history (fiche 36).
  
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
- 0dceff3: Add the `content.newEntryDefaultBlocks` editorial site setting to the
  site-settings registry (a comma-separated list of contract B block type
  names, default `"prose"`). The admin's new-entry flow reads it to pre-fill a
  fresh `blocks` field with a sensible starting set instead of an empty array —
  purely an admin default: an empty string is a valid, deliberate opt-out
  ("no starting blocks"), and nothing about `blocks` fields' storage shape or
  validation changes. `@cogenta/admin` is unpublished and carries no changeset
  of its own for its matching UI (a rich-text toolbar code block, an ordered
  list/blockquote already present, and a Markdown/HTML source-view toggle for
  the `richText` field editor — all admin-only affordances degrading to
  contract A's existing `richText` vocabulary, never a new node type).
- 3cbd6d7: L22 task 5 — OpenTelemetry request tracing, a configurable log level, and
  an admin "Exploitation" > Observability screen, all on by default and
  working with zero external service (R1).
  
  **New package `@cogenta/observability`:** wraps `@opentelemetry/api` +
  `@opentelemetry/sdk-trace-base` (a real new dependency — see the task
  report for size and maintenance detail; this is the industry-standard
  choice, never a hand-rolled tracer). `createObservabilityRuntime` builds
  one server span per HTTP request (`withRequestTracing`) and a bounded,
  in-process "recent events" buffer (`ObservabilityRecentStore`, same ring-
  buffer shape `@cogenta/core`'s `createErrorLog` already uses) that the
  admin reads. A local NDJSON exporter runs always, needing no external
  service; an OTLP HTTP exporter runs in addition when an endpoint is
  configured — never one hardcoded vendor, any OTLP-speaking backend
  (Grafana, Datadog, …) works. `withRecentLogCapture` wraps any
  `@cogenta/core` `Logger` so its records also feed the same buffer, gated
  by a dynamic level getter rather than the logger's own fixed threshold.
  Every field passes through `@cogenta/core`'s `redact()` before storage —
  the same discipline the audit log already applies — and a trace only ever
  carries a request's method, path (query string stripped) and status code,
  never a header, cookie, or body.
  
  **`@cogenta/core`:** a new `observability` config section
  (`cogenta.config.mjs`) — `serviceName` and `otlpEndpoint`, resolved
  always, defaults needing nothing external. No `otlpHeaders` field, on
  purpose (rule R7, same shape as `payment`'s missing `stripeSecretKey`):
  those come from `COGENTA_OTLP_HEADERS`/`OTEL_EXPORTER_OTLP_HEADERS` only,
  refused if written to the file (`CONFIG_SECRET_IN_FILE`). `serviceName`
  and `otlpEndpoint` also honour the standard `OTEL_SERVICE_NAME`/
  `OTEL_EXPORTER_OTLP_ENDPOINT` environment variables as a fallback.
  
  **`@cogenta/schema`:** `SITE_SETTINGS_REGISTRY` gains a new `observability`
  group with two editorial settings — `observability.enabled` (default on)
  and `observability.logLevel` (`error`/`warn`/`info`/`debug`, default
  `info`) — changeable from the admin with no restart, unlike the OTLP
  export destination above.
  
  **`@cogenta/api`:** `createObservabilityRouter` — `GET /api/observability`,
  admin-only, read-only, answering the current `enabled` state plus the
  recent traces and logs.
  
  **`@cogenta/cli`:** `cogenta serve` wires all of the above — the HTTP
  listener is wrapped with `withRequestTracing`, the shared logger is
  wrapped with `withRecentLogCapture`, and `observability.enabled`/
  `observability.logLevel` are polled from the settings store every 15s
  (configurable via `ServeOptions.observabilitySettingsTickMs`, a test
  seam) so an admin's change takes effect without a restart.
- 249eb6f: Add the update system (L22 task 9): checking npm for a newer `@cogenta/core`/
  `@cogenta/cli`, and applying one with a mandatory restore point first — never an
  update with no safety net.
  
  `@cogenta/core` gains `readOwnPackageVersion` (self-describing package version,
  read from a package's own `package.json`, never bundled at build time) and
  `getCoreVersion`, its own version computed with it — **lazily, cached after the
  first real call, never a top-level constant**: a top-level `CORE_VERSION =
  readOwnPackageVersion(...)` was the first design, and it broke every
  `@cogenta/admin` test that happened to pull `@cogenta/core` in transitively,
  because that suite's `import.meta.url` is not a `file://` URL under
  Vitest+jsdom's Vite transform. `@cogenta/core` is imported (for types) by
  enough of this monorepo, including browser-bundled code, that nothing at its
  top level may assume a real Node `file://` module URL — fixed before it ever
  shipped, but worth naming so the next self-describing constant doesn't repeat
  it. New error codes: `PACKAGE_VERSION_UNREADABLE`, `UPDATE_CHECK_FAILED`,
  `UPDATE_RESTORE_POINT_FAILED`, `UPDATE_APPLY_FAILED`, `UPDATE_NOT_AVAILABLE`,
  `UPDATE_CONFIRMATION_REQUIRED`, `UPDATE_POLICY_INVALID`.
  
  `@cogenta/schema` gains one new site-settings-registry entry,
  `updates.autoUpdatePolicy` (`off`/`patch`/`patch-minor`/`patch-minor-major`, off by
  default) — a normal editorial setting through the existing generic settings store,
  no new persistence mechanism.
  
  `@cogenta/api` gains `createUpdateRouter`: `GET /api/updates/status` (a live
  version check against npm, per package), `GET /api/updates/history` (past
  checks/applies plus the restore points they took), and `POST /api/updates/apply`
  (admin-only, every route).
  
  `@cogenta/cli` gains `cogenta update check|apply|history`, wired the same way into
  `cogenta serve`'s admin API and into a new daily `updates-auto-check` scheduled
  task that honours `updates.autoUpdatePolicy` — never auto-applies a version whose
  changelog scan flagged a frozen contract, and never re-applies the same version on
  every tick after a successful auto-apply (this process's own version constant
  cannot change without an actual restart).
  
  A **real bug fix**, found while wiring `getCliVersion`: `bin.ts` never passed its
  own version to `run()`, so `cogenta version`/`cogenta --version` always printed the
  fallback `"0.0.0"` regardless of what was actually installed. Fixed.
  
  **Contract-risk detection is real but honestly limited.** It reads the target
  version's own published `CHANGELOG.md`, fetched from its npm tarball
  (`registry.npmjs.org` only, a small zero-dependency ustar/pax reader — no `tar`
  dependency, R9) and scanned for a frozen-contract mention. `@cogenta/core` and
  `@cogenta/cli` add `CHANGELOG.md` to their own `"files"` for this to work — every
  version already published before this ships has no `CHANGELOG.md` in its tarball
  (verified with a real `npm pack` while building this), so the check reports an
  honest "could not determine" for those rather than a false "no risk found." Even
  once readable, this is a keyword scan of prose, not comprehension — a strong hint
  an admin reviews before confirming, never a certification.
  
  **Out of scope, deliberately**: this updates a site's npm packages only — `cogenta
  build`/`deploy` remain honestly deferred (L9), and no migration ever runs
  automatically (`cogenta migrate status`/`migrate up` stay a separate, explicitly
  confirmed step, exactly as today).
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
- befad6d: Two new site settings (L25 D2): `general.socialLinks` (site-scoped, up to 12
  `{label, url}` entries, `url` must be `http(s)`) and `general.footerNote` (locale-scoped,
  up to 400 characters). Both feed `resolveChromeExtras` (`@cogenta/cli`) into
  `ChromeInput.social`/`ChromeInput.footerNote` (contract D `theme@1.4`).
  
  `SITE_SETTING_UI_TYPES` gains `'linkList'` — a new, generic `uiType` for a short ordered
  list of `{label, url}` pairs, editable as one `Label | https://url` line per entry.
  `general.socialLinks` is its first user.
- e8061e2: `ContentStore` gains `countByStatus()`, a real `GROUP BY status` count of a
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
- 2285720: Menus gain a real editor (fiche `docs/plans/09-menus.md`):
  
  - **Edit an item in place.** `PATCH /api/menus/{id}/items/{itemId}` now accepts `label`, `kind`, the target fields, `title` and `openInNewTab` — no more delete-and-recreate to fix a typo. Changing `kind` clears the previous target rather than keeping a value that no longer applies. `parent` is deliberately not accepted here; re-parenting still goes through `POST .../move`.
  - **Bulk, transactional reorder.** `MenuStore.reorderItems` and `PATCH /api/menus/{id}/items` rewrite `parent`/`position` for any number of items in a single transaction, so a drag-and-drop or keyboard reordering session commits (or fails) as one unit — never a partially-rewritten tree if the network drops mid-session.
  - **Menu locations.** `Menu` gains `location: string | null` (`byLocation`, `GET /api/menus/by-location/{location}`) — where a menu renders (`primary`, `footer`, …), carried by the menu itself rather than baked into a theme's name convention. `@cogenta/cli`'s `ThemeRenderOptions` gains `headerMenuLocation`/`footerMenuLocation`, resolved generically by location with a fallback to the legacy `main`/`footer` name lookup, so an existing site's navigation keeps rendering unchanged. `@cogenta/core` gains the `MENU_LOCATION_TAKEN` error code for the one-menu-per-location-per-locale rule.
  - **Two new item kinds.** `taxonomy` (links to a term) and `home` (always resolves to `/`) join `entry`/`url`/`submenu-placeholder`.
  - **Target health.** A menu item resolver may now report `health` (`published`/`draft`/`scheduled`/`archived`/`trashed`) for an `entry` item — computed only for an actor whose role already has draft access to the target collection, so a public read never learns that a draft exists. `cogenta serve`'s public render hides a dead `entry`/`taxonomy`/`home` link entirely rather than serving one.
  
  All additions are backward compatible: `resolveEntry` gained a third `context` parameter and an optional `health` on its result, but a two-argument resolver still satisfies the type; every new field is optional or nullable on the wire.
- 46572ba: Add the admin notification center (fiche 38): a bell with an unread count, filterable
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
- 9b1dae8: Fiche 43 sub-chantiers A, B, E, F (Cogenta Page Builder — motifs, copier/coller, verrouillage/sélection multiple, import/export) — extends the L16 visual page builder without touching contract A, B, C or D.
  
  **Sub-chantier A — pattern/model library.** `@cogenta/schema` gains a new
  one-fixed-table store (`ensurePatternTables`/`createPatternStore`,
  `cogenta_patterns`), the same "not schema-declared, one fixed pair/table"
  treatment `menu-tables.ts` already gets — a pattern is a reusable *shape* an
  editor composes from existing blocks, never a thirteenth block type. Two
  kinds share the table: a **motif** (a few blocks, added to whatever a page
  already has) and a **modèle de page complet** (replaces the whole block
  zone, and only ever behind explicit confirmation in the admin — never
  silently). `@cogenta/api` gains `createPatternRouter` (`/api/patterns`,
  admin/editor only on every method, mirroring `redirect-router.ts`'s fixed
  door) with two new error codes on `@cogenta/core`, `PATTERN_UNKNOWN`/`PATTERN_INVALID`. A
  pattern's blocks are validated against the site's block registry
  (`@cogenta/blocks`'s `vocabularyRegistry` by default, overridable) exactly
  the way a clipboard paste is: one unknown block type refuses the whole
  pattern, never a partial or best-effort insert. `@cogenta/cli` wires both
  into `cogenta serve` (`ensurePatternTables` at boot, `/api/patterns` mounted
  next to `/api/menus`) and into `cogenta backup`/`cogenta restore`
  (`PATTERN_TABLE` added to the table list `buildBackupTables` already
  assembles).
  
  **Sub-chantier B — copy/paste and reusable blocks.** Purely client-side
  (`@cogenta/admin`, no published package touched): `Ctrl/⌘+C`/`Ctrl/⌘+V` on
  the builder's block selection, through the browser clipboard as
  `cogenta/blocks@1`-tagged JSON, validated the same way on paste (unknown
  block type named and refused). "Blocs réutilisables" is deliberately not a
  second mechanism — fiche 05 task 3's own recommendation — a single-block
  pattern already covers it: insertion is always a copy, never a live
  reference, so there is nothing in contract B to touch.
  
  **Sub-chantier E — lock and multi-select.** Also admin-only. A lock is a
  session-only admin flag, never persisted to contract B or the server; a
  locked block cannot be moved (by its own controls, by a neighbour's move
  displacing it, or as part of a group move) or removed. Multi-select is
  scoped to the outline list (`Shift`+click), never the preview — the same
  `Shift`+click a keyboard/switch user can also drive, with named group
  buttons doubling every drag, per the lot's own rule. A group move/remove is
  always one undo step, never one per block.
  
  **Sub-chantier F — import/export.** A pattern library round-trips through a
  versioned JSON file (`cogenta/pattern-file@1`), validated block-by-block on
  import the same way a save is. `provenance`/`provenanceDetail` follow
  contract A's own values (`human`/`assisted`/`generated`) — a pattern an
  agent generates is never indistinguishable from one a person authored by
  hand.
  
  `cogenta_patterns` has the same one-suite-run-four-times contract test as
  `taxonomy-store.ts`/`content-store.ts` (`pattern-store.contract.ts`,
  SQLite as a unit test and Postgres/MySQL/MariaDB as loud-skip integration
  tests) — deliberately not left SQLite-only the way `menu-store.ts`'s own
  table predates this discipline and still is.
  
  No contract touched: A, B, C and D are all unchanged. `PermissionLayer`
  gains no new method — pattern management is a fixed admin/editor rule, the
  same shape `redirectRouter`/`menuRouter` already use, and *inserting* a
  pattern's blocks into an entry still goes through the entry's own existing
  `update` permission (`POST /api/builder/render`'s `PermissionLayer.assert`),
  unchanged.
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
- 5de237f: Fiche 63 (ADR-0028) — a role's grant on a collection or taxonomy action can
  now be overridden in the database, applied on the very next request with no
  deploy cycle. `cogenta.schema.*`'s `permissions` block stays the source of
  truth for a site that never writes an override; the database is checked
  first and falls back to the file, never the other way around.
  
  `@cogenta/core` gains three error codes: `ROLE_PERMISSION_TARGET_UNKNOWN`
  (404 — an override names a collection/taxonomy the site does not declare),
  `ROLE_PERMISSION_INVALID` (400 — a malformed override, including `own` on a
  taxonomy, which has no author) and `ROLE_PERMISSION_EXPORT_INVALID` (a
  malformed `cogenta roles export` file being read back).
  
  `@cogenta/schema` gains `createRolePermissionStore` (validates every write
  by folding the candidate rule into the real `CollectionDefinition`/
  `TaxonomyDefinition` and reusing `defineCollection`/`defineTaxonomy`
  unmodified — no second validation logic), `createRolePermissionOverlay` (the
  synchronous, refreshable read-through cache `PermissionLayer` consults),
  `ensureRolePermissionTable`/`ROLE_PERMISSIONS_TABLE`, and
  `serialiseRolePermissionExport`/`parseRolePermissionExport` for freezing the
  table's state into a versioned JSON file. All additive; contract A
  (`CollectionDefinition`, `TaxonomyDefinition`, `CollectionPermissions`) is
  unchanged — the override table lives entirely outside the contract.
  
  `@cogenta/api`'s `createPermissionLayer` gains an optional
  `rolePermissionOverrides` option (a `RolePermissionOverrides` from
  `@cogenta/schema`) — absent behaves byte-for-byte as before. A new router,
  `createRolePermissionRouter`, serves `GET`/`PUT /api/role-permissions` and
  `DELETE /api/role-permissions/{targetType}/{targetName}/{action}`,
  admin-only. `STATUS_BY_CODE` gains the two new HTTP-mapped error codes above.
  
  `@cogenta/cli` wires the override store and overlay into `cogenta serve`
  (mounting `/api/role-permissions`, journaling every successful write to the
  audit log), `cogenta mcp` and `cogenta channels` (each builds its own
  `PermissionLayer`, so each needed the same wiring — otherwise a permission
  revoked in production would stay granted to those processes until restart).
  A new command, `cogenta roles export [--out <path>]`, freezes the table into
  a file a site can commit to git.
- 2c1af5d: Fiche 28 (tâches planifiées): a real scheduled-task registry and its admin
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
- 745ebd8: Editorial workflow and owner permission (`schema@2.1`, ADR-0027, fiche 37 + fiche 19
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
- 4bb6ba3: Fiche 50, tasks 1-5 — direct sitemap/robots.txt links from the Diagnostic tab, Search Console/Bing site verification (meta tag only, no OAuth — R1/R7), a hand-written robots.txt addendum, and wiring the two indexing extras (`indexnow.ts`/`llms-txt.ts`) that were written and unit-tested since L3/L9 but never reachable from any route or setting. Task 6 (RSS/Atom) is explicitly out of scope, per the fiche's own "à confirmer".
  
  - **`@cogenta/seo`**: `RobotsOptions` gains `customRules` — an admin's own robots.txt lines, merged in verbatim by `renderRobotsTxt` after the derived group(s) and before the `Sitemap:` directive. New export `robotsRuleDisallowsEverything(text)` — true when `text` contains a bare `Disallow: /`, so a caller (the admin's custom-rules editor, in particular) can confirm before saving a rule that would block every crawler.
  - **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY`'s `seo` group gains six settings — `seo.googleSiteVerification`/`seo.bingSiteVerification` (meta-tag verification tokens), `seo.robotsCustomRules` (free text, merged into `/robots.txt`), `seo.indexNowEnabled`/`seo.indexNowKey` (off by default), `seo.llmsTxtEnabled` (off by default). All admin-only, all in the existing `SiteSettingsStore` — no new table.
  - **`@cogenta/api`**: `SeoRouterOptions` gains `robotsCustomRules` (an async getter, same "read live" contract as `titleDefaults`) — the Diagnostics screen's `robots.content` preview now shows the exact document `/robots.txt` serves, custom rules included, and `disallowsEverything` also flags a custom rule that blocks every crawler.
  - **`@cogenta/cli`**: `seo.ts`'s `SeoRenderDefaults` gains `googleSiteVerification`/`bingSiteVerification`/`robotsCustomRules`; new export `siteVerificationMetaTags` renders the two `<meta>` tags. New export `SeoOperationalSettings`/`readSeoOperationalSettings` for the two off-by-default extras. `RobotsRenderOptions`/`renderRobots` gain `customRules`. `PageChromeOptions` (`theme-render.ts`) gains `seo`, so `/search` and `/forms/{name}` carry the same verification tags every entry page does. `cogenta serve` gains `GET /llms.txt` (404 unless `seo.llmsTxtEnabled`) and IndexNow's ownership-proof key file at `/<key>.txt` (served only when the requested key matches the configured one), and pings IndexNow on a successful publish/unpublish response when `seo.indexNowEnabled` is on — never blocks or fails the response it follows.
  
  Admin (`@cogenta/admin`, private, no changeset): the SEO screen's Général tab gains a search-engine-verification card and an IndexNow/llms.txt card (with a "Generate a key" button); the Diagnostic tab gains "Open sitemap.xml"/"Open robots.txt" links and an editable robots.txt custom-rules field that asks for confirmation before saving a rule containing `Disallow: /`.
- 960757d: Fiche 70 (SEO platform parity — AIOSEO/The SEO Framework/MonsterInsights/Site
  Kit) — four tasks closing the gaps a real research pass found against those
  four tools, which the earlier SEO fiches (13, 50) never looked at.
  
  **Task 1 — real-time content score.** `@cogenta/seo` gains `analyseContent`
  (`content-analysis.ts`): a pure, synchronous TruSEO-style scorer over
  contract A's rich text — keyword usage in title/description/first sentence,
  keyword density, sentence length, subheadings, content length. Returns a
  closed `'red' | 'orange' | 'green'` score, never a numeric percentage. A new
  conventional field, `seoFocusKeyword`, joins `seoTitle`/`seoDescription`/etc.
  (contract A untouched). The admin panel keeps its own mirrored copy of the
  algorithm rather than depending on `@cogenta/seo`/`@cogenta/schema` — the
  admin is a browser bundle and never takes that dependency.
  
  **Task 2 — internal link assistant.** `@cogenta/seo` gains
  `analyseInternalLinks` (`link-assistant.ts`), reusing `@cogenta/schema`'s
  existing `extractLinks`: reports entries with no inbound link and, for
  entries sharing title words, up to five link candidates. `@cogenta/api`'s
  `createSeoRouter` gains `GET /api/seo/link-suggestions?collection=…`, gated
  by `update` on the named collection (never `admin`) so an editor can run it
  on whatever they may already write.
  
  **Task 3 — SEO feature grid.** Four new `seo.*` boolean settings
  (`contentScoreEnabled`, `linkAssistantEnabled`, `searchVerificationEnabled`,
  `robotsCustomRulesEnabled`) in `@cogenta/schema`'s site settings registry,
  all defaulting to `true` so an upgrading site's behaviour is unchanged. The
  last two are gated centrally inside `@cogenta/cli`'s `readSeoRenderDefaults`,
  so every consumer (public `robots.txt`, verification meta tags, the
  diagnostics scan) honours the toggle with no per-call-site duplication.
  
  **Task 4 — optional Google Search Console connector (ADR-0032).**
  `@cogenta/seo` gains `search-console.ts`: a fetch-only OAuth client (no
  `googleapis` SDK) for the authorization URL, token exchange/refresh, and one
  read-only `searchAnalytics.query` call — structurally incapable of writing
  anything on the Google side. `@cogenta/schema` gains
  `createSearchConsoleConnectionStore`: one site-wide connection row,
  AES-256-GCM at rest via `COGENTA_AUTH_SIGNING_KEY` (same discipline as the
  LLM provider store), full SQLite/Postgres/MySQL/MariaDB contract suite.
  `@cogenta/api` gains `createSearchConsoleRouter`
  (`/api/seo/search-console/*`): `status`/`authorize`/`metrics`/`disconnect`
  are admin-only; `callback` (Google's own browser redirect target) carries no
  bearer token by design, proven legitimate instead by an HMAC-signed,
  ten-minute `state` token keyed by `COGENTA_AUTH_SIGNING_KEY`. `@cogenta/core`
  gains the `searchConsole` config section (client id/secret, environment-only,
  refused in the config file like every other secret) and five new error codes
  (`SEARCH_CONSOLE_NOT_CONFIGURED`/`_NOT_CONNECTED`/`_STATE_INVALID`/
  `_TOKEN_EXCHANGE_FAILED`/`_QUERY_FAILED`). Absent without both
  `COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`_CLIENT_SECRET` set — every other SEO
  feature, including tasks 1-3 above, works identically with or without it
  (R1/R2), which was the explicit condition the user set when accepting
  ADR-0032.
- 2d84729: Fiche 21, task 3 — merge SEO + Redirections into one admin screen, and make sitemap/social/title settings real and admin-editable (previously "read-only by design", a scope choice of a previous lot rather than an ADR).
  
  - **`@cogenta/seo`**: `MetadataOptions` gains `fallbackImage` — a site-wide default Open Graph/Twitter Card image, used by `buildMetaTags` only when neither the caller's own `image` nor the resource's `seoImage`/first `media` field resolves to anything. `SitemapOptions` gains `collectionOverrides` (new exported type `SitemapCollectionOverride`) — per-collection `included`/`changefreq`/`priority`, applied by `sitemapUrlsFor`; `included: false` drops every entry of that collection from the sitemap outright.
  - **`@cogenta/api`**: `SeoRouterOptions.titleTemplate`/`collectionTitleTemplates` (static, and never actually wired to anything — dead since the fields were added) are replaced by `titleDefaults`, an async getter read fresh on every diagnostic scan and SEO preview, mirroring the "read live, never cached at startup" contract `@cogenta/cli`'s `ThemeRenderOptions.homePath` already uses. **Breaking** for any direct caller of `createSeoRouter` passing the old static fields.
  - **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY` gains a `seo` group — `seo.titleTemplate`, `seo.collectionTitleTemplates`, `seo.defaultMetaDescription`, `seo.sitemapCollectionSettings`, `seo.twitterHandle`, `seo.defaultSocialImageUrl` — persisted through the same `SiteSettingsStore` `settings.tsx`'s Général/Reading/Discussion tabs already use, no new table or migration.
  - **`@cogenta/cli`**: `seo.ts` gains `SeoRenderDefaults`/`readSeoRenderDefaults` (reads the six settings above, live); `seoSiteFor` and `HeadOptions`/`renderSeoHead` take an optional `seo`/`SeoRenderDefaults` to apply the title template, per-collection template override, default meta description, Twitter handle and fallback social image; `buildSitemapFiles` takes an optional `collectionOverrides`. `ThemeRenderOptions` gains `seo?: () => Promise<SeoRenderDefaults>`, wired into every render path in `cogenta serve` (published page, page-builder preview, admin SEO preview redirect check, `/sitemap.xml`) so a saved setting shows up on the very next request, no restart.
  
  Admin (`@cogenta/admin`, private, no changeset): `/seo` and `/redirects` merge into one nav entry ("SEO") with five tabs — Général, Sitemap, Réseaux sociaux, Redirections (the previous `redirects.tsx` screen, unchanged, now `RedirectsPanel`), Diagnostic (the previous read-only reports, unchanged, now loaded lazily only when that tab is opened). `/redirects` still resolves (redirects to `/seo?tab=redirects`), the same pattern already used for `/site-plan` → `/create-site`.
- 835d736: L22 task 3: "l'agent qui surveille le site" — the one concrete case the lot's spec asks to ship first, tested end to end against a real `cogenta serve`. A superagent-shaped agent, disabled by default like the other two examples, that reads the public 404 log (never source code, never a request body or an IP — the log itself carries neither), picks a genuinely related, routed page, and proposes or creates a redirect depending on the site's configured autonomy — reusing the runtime `withAutonomyForManifest` already built for L22 task 1, not a bespoke gate.
  
  `@cogenta/agents` gains a fourth built-in agent, "Site Monitor" (`SITE_MONITOR_AGENT_NAME`, `builtins.ts`), disabled by default with a daily cron trigger, autonomy `propose` by default — raising it to `autonomous` (autopilot) is what the lot names as the condition for an *applied*, not merely *suggested*, redirect. Four new contract-C tools back it: `logs.read_not_found` (new permission `logs.read`, read-only over `@cogenta/schema`'s `NotFoundLogStore`), `content.collections`/`content.list` (both under the existing `content.read` permission — browsing is the same access as reading one entry, not a wider grant), and `redirects.create` (new permission `redirects.write`, `sideEffects: true`, `reversible: true` — its `revert` removes exactly the redirect it created). Contract C moves to `tools@1.2` (`docs/04-contrats.md`): two permissions added by the bottom to an open taxonomy, no existing tool signature touched — the same kind of change `document.extract` was in `tools@1.1`.
  
  `@cogenta/schema`'s `RedirectReason` gains a fourth value, `'agent'` — `redirects.create` always writes it, never `'manual'`, so an admin looking at the Redirections screen can tell which rows a human typed and which one an agent proposed and had applied. Additive to a stored, open list (not a versioned contract enum); a row written by an older build still reads back fine (`toRecord`'s existing fallback to `'manual'`).
  
  `@cogenta/api` gains `createMonitoringRedirectSuggestionSource` (`notices/monitoring-redirect-suggestion.ts`) — the dashboard half: a redirect an agent proposed under `co-pilot` autonomy surfaces as an admin notice (from/to, which agent), linking straight to the *existing* Redirections screen rather than a second confirmation UI, and disappears on its own once the redirect exists (created by hand, or later applied under `autopilot`) — never because the underlying `ApprovalQueue` request was "decided" (L22 task 1's queue still has no admin surface to decide anything from).
  
  `@cogenta/cli`'s `agent-runtime.ts` wires all four new tools into the site's real tool registry (the real `NotFoundLogStore`/`RedirectStore`/`CollectionDefinition[]` `serve.ts` already builds, never a second instance) and now exposes the runtime's `ApprovalQueue` on `AgentRuntimeAssembly` so `serve.ts` can build the notice source over the exact same queue `co-pilot` autonomy files into. `serve.ts` adds one more entry to the notices sources array — the seam fiche 38 designed this mechanism around — and threads `collections`/`notFoundLog`/`redirects` into `buildAgentRuntime`.
  
  R2 holds throughout: with no LLM provider configured, the Site Monitor exists in configuration (seeded, listable, editable) and attempts zero network calls — `AgentRunner.run()`'s existing `AGENT_NO_PROVIDER` guarantee, unchanged, covers this agent the same as every other one.
  
  **Deliberately out of scope, named honestly rather than silently promised**: server-error and downtime detection (the lot's own other two example anomalies) are not built — this task ships the one case the spec asks to land first, tested end to end; the other two stay documented ideas for a future lot.
  
  No new dependency (R9): every new tool wraps a store or a route this project already had (`NotFoundLogStore`, `RedirectStore`, `ContentService.summary`/`list`, `buildPath`), and `@cogenta/agents` already depended on `@cogenta/schema`.
- 9e67928: Taxonomy terms can now be edited (multi-locale labels, slug) and moved to a new parent without losing classification, per ADR-0022's materialised-path model. `GET /api/taxonomies/{name}` gains `?q=` (accent- and case-insensitive search), `?counts=1` (per-term entry counts, direct and with descendants) and `?unused=1` (terms nothing classifies), each permission-gated the same way ordinary content reads are. `countTaxonomyUsage` is a new export of `@cogenta/schema`.
- 954460e: Add the translation dashboard (fiche 10 task 1) — everything needed to answer "what
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
- 3824e8e: Fiche 06 (versions et historique): `diff.ts` gains `diffWords`, `extractPlainText` and
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
- f47e893: `f.media({ many: true })` and `f.select({ many: true })` now actually store more than one
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
- 1cdf7d7: Fix a real race in `createScheduledTaskRegistry`'s `tick()`: it used to read a task's last run and decide it was due with no atomic write between the two, so two `cogenta serve` replicas (or a replica racing a `cogenta cron` invocation) against the same database could both see a task as due and both execute it at once — including the destructive trash-purge sweep.
  
  `tick()` now claims a task with a compare-and-set `UPDATE` against a new internal table (`SCHEDULED_TASK_CLAIMS_TABLE`) before running it: only one of two racing claims can win, and the loser skips the task for that tick rather than running it. The same guarded-`UPDATE`-and-check-`rowsAffected` shape already used by `@cogenta/commerce`'s stock guard and `@cogenta/core`'s database job queue — no dialect-specific locking primitive, the same query runs unmodified on SQLite, Postgres and MySQL/MariaDB.
  
  No public behavior changes for a single-process site: `list()`, `get()`, `runNow()` and the timing of `tick()`'s due-check are unaffected. `CreateScheduledTaskRegistryOptions` gains an optional `claimsTable` field (defaults to `SCHEDULED_TASK_CLAIMS_TABLE`), and the new table is created automatically the first time the registry is used — no manual migration needed.
- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [0e88f30]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
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
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [07c0f0a]
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
