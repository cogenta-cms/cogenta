# @cogenta/api

## 2.0.0

### Major Changes

- [`54ca689`](https://github.com/cogenta-cms/cogenta/commit/54ca6894449fcdd29ff76eef4514cda7c081f483) Thanks [@georgesmomo](https://github.com/georgesmomo)! - API key lifecycle, rotation and a per-key request quota (fiche 20).
  
  **Breaking (`@cogenta/api`):** `POST /api/api-keys` no longer mints a key that
  never expires by default. A request that omits `expiresAt` now gets a
  90-day expiry — a real, generous but bounded default, since a key with no
  expiry is a key that leaks forever. Pass `neverExpires: true` explicitly to
  keep the old "never expires" behaviour. Any script that creates API keys
  without setting `expiresAt` will see its keys start expiring after 90 days;
  set `neverExpires: true` (or a longer `expiresAt`) if that is not wanted.
  
  New, additive:
  
  - `POST /api/api-keys/{id}/rotate` (`@cogenta/api`, `@cogenta/auth`'s
    `ApiKeyStore.rotate`): mints a replacement carrying the same name, scope
    and quota, and lets the original keep authenticating for a chosen grace
    window (1h/24h/7d) instead of dying mid-flight. The new key's raw value is
    returned exactly once, the same rule `POST /api/api-keys` already follows.
  - A per-key request quota (`rateLimitPerMinute`, `@cogenta/auth`), enforced
    once per request by `resolveActor` when a `RateLimitDriver` is supplied.
    Exceeding it answers `429` with `Retry-After` and `RateLimit-*` headers.
    `@cogenta/core` gains the `rateLimit` driver need (`createRateLimitRegistry`,
    a Redis driver and an in-process one — R1: works with no Redis at all) and
    a matching `rateLimit` configuration section; `cogenta serve`/`doctor` wire
    and report it.
  - Aggregated 7- and 30-day call counts per key (`ApiKeyStore.usage`), and a
    new admin notice when a key is within seven days of expiring
    (`createApiKeyExpiryNoticeSource`).
  - `ApiKey` gains `rateLimitPerMinute` and `supersededBy` (set once a key has
    been rotated). `ApiKeyStore` gains `getById`, `rotate` and `usage`.
  
  New error codes: `API_KEY_RATE_LIMITED` (429), `API_KEY_ROTATION_INVALID`
  (409 — a revoked or expired key cannot be rotated), `RATE_LIMIT_FAILED`.
  
  The property that a raw API key is shown exactly once, never twice, holds
  for the new rotate response too: `listApiKeys` and the `previous` half of a
  rotation response never carry key material.

### Minor Changes

- [`0692713`](https://github.com/cogenta-cms/cogenta/commit/06927130c15f7bc95ea97839cb50f67de87bd668) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 30 — agents and assistant admin:
  
  - `@cogenta/core`: adds a resolved `assistant.monthlyTokenLimit` config section (default one million tokens a month) and a new `ASSIST_BUDGET_EXCEEDED` error code.
  - `@cogenta/agents`: adds `createAssistUsageTracker`, a per-tool, calendar-bucketed token/call counter for the writing assistant (distinct from the existing per-agent `BudgetTracker`), wired into `createAssistToolset` and `createAssistRuntime` (`AssistRuntimeOptions.onUsage`, `AssistRequest.tool`). `AssistToolset` gains optional `model` and `usage` fields.
  - `@cogenta/api`: `GET /api/assistant` now reports `model`, `usage` (when a tracker is configured) and `vector` (driver/dimensions/count/lastIndexedAt, when a vector store exists). `POST /api/assistant/run` refuses with `ASSIST_BUDGET_EXCEEDED` (429) once the monthly cap is reached, before the provider is called. `createAssistantRouter` gains an optional `vectorInfo` option.
  - `@cogenta/cli`: `AssistantAssembly` gains `vectorInfo` (vector index visibility) and wires a usage tracker into the assistant toolset from `config.assistant.monthlyTokenLimit`. `withVectorIndexing` gains an optional `onIndexed` callback. `recordContentAudit` now records an accepted assistant suggestion's `field`/`tool` (sent by the admin as `assistApplied` on a content save) distinctly in the audit diff, alongside contract A's existing `provenance`/`provenanceDetail`.
  
  All additive — a site with no `assistant` config section gets the same default cap as before, and a site with no AI provider sees no `usage`/`model`/`vector` fields at all.

- [`36744d3`](https://github.com/cogenta-cms/cogenta/commit/36744d3bc8e74a39fa6c68bdd78804fad1d8f069) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 21: the audit log gains what the state-of-the-art comparison named as
  missing — a real entry detail, filters that reach a date range, an export,
  an actually-scheduled integrity check, and a way to tell a human's action
  from an agent's.
  
  **Task 1 — detail.** `GET /api/audit/{id}` (`@cogenta/api`'s `audit-router.ts`)
  answers with the entry, its resolved actor kind and label (an email, or an
  API key's name), and — for a `content.create`/`update`/`restore` action — the
  same structural diff `GET /{collection}/{id}/diff` already computes, called
  through rather than recomputed (the fiche's own warning against duplicating
  it). This needed a place to keep which content version an action produced:
  `RecordAuditInput`/`AuditEntry` gain `version`, stored in a new nullable
  `cogenta_audit_log.version` column added with a `try`/`catch` `alter table`
  (no portable `add column if not exists` across SQLite/Postgres/MySQL) — and
  **deliberately excluded from the hash `computeHash` chains together**. Adding
  a field to that canonical list would change what every already-recorded hash
  means, and every site's existing chain would fail `verify()` the moment this
  code ran. The fields that matter for accountability — who, when, what
  action, on what — are untouched; `version` is UI-convenience metadata, not
  inside the tamper-evidence boundary. A permission refusal on the diff's own
  collection (an admin who was never granted an authoring role there) degrades
  to `diffUnavailable`, not a 403 for the whole entry.
  
  **Task 2 — dates, export, pagination.** `since`/`until`/`actorKind` filters
  on `GET /api/audit`, and `GET /api/audit/export?format=csv|json` (bounded to
  10,000 entries) for the filtered view. The export is itself an audit-worthy
  event — a personal-data extraction, per the fiche — recorded as
  `audit.export` (format and count only, never the exported rows) at the same
  transport-boundary layer `cogenta serve` already records every other
  mutation at.
  
  **Task 3 — scheduled integrity, for real.** `@cogenta/auth` gains
  `AuditLog.verifyRange`/`get` (a bounded, checkpoint-resuming form of
  `verify()`) and `createAuditIntegrityStore`, which persists the last
  check's outcome across a restart. `cogenta serve` runs it once at startup
  and then on its own `setInterval` (daily by default,
  `ServeOptions.auditIntegrityTickMs` overridable for tests) — the same
  accepted trade-off as the scheduled-publication tick. Most runs are
  incremental (only entries after the last checkpoint); a full replay runs
  weekly on its own as the backstop the fiche asks for, since an incremental
  check cannot see tampering in already-checkpointed history. A break sends
  one signed channel alert (`security.audit_integrity_broken`, only on the run
  that first finds it — never once per tick) and a non-dismissible, danger-
  severity admin notice that clears itself once a forced full check reports
  the chain intact again. `GET`/`POST /api/audit/integrity` expose the status
  and the "verify now" that persists its result, alongside the untouched,
  stateless `GET /api/audit/verify`.
  
  **Task 4 — distinguishing actors.** `classifyAuditActor` (`@cogenta/auth`)
  reads signals the log already carried — `actorId === null` is `system`, the
  `apikey:` prefix `resolveActor` has minted since L13 is `api_key`, the
  `agent.tool.` prefix `withAudit` has minted since L4 is `agent`, everything
  else is `human` — no schema change needed. `withAudit` (`@cogenta/agents`)
  gains optional `model`/`autonomyLevel`, carried into the recorded diff when
  a caller tracks them. `?actorKind=` filters `GET /api/audit`.
  
  **Task 5 — retention, honestly.** No purge is wired into a schedule in this
  pass — `AuditLog.prune(olderThan)` exists, tested, and safe (it refuses to
  purge a segment that does not itself verify first, and records a genesis
  anchor so the surviving chain keeps verifying from a documented truncation
  point rather than silently going quiet about it), but nothing calls it
  automatically yet. The admin screen says so plainly: this journal keeps
  every entry and grows without limit until an operator acts.
  
  None of this is a breaking change: `AuditLog.verify()`'s signature and every
  existing route's response shape are unchanged, and the new column/tables
  are additive (a fresh `ensureAuthTables` run tolerates them being already
  there, an existing install picks them up the same way).

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

- [`967ec5a`](https://github.com/cogenta-cms/cogenta/commit/967ec5a64a85ef0030a764e72a151a8bc8edfca6) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add editorial SEO controls: the conventional `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex`/`seoCanonical` override fields, a title-template option, and an admin-only door onto what `@cogenta/seo` actually computes (fiche 13).
  
  - `@cogenta/seo`'s `buildMetaTags` now reads the conventional `seoTitle`, `seoDescription`,
    `seoImage` and `seoCanonical` fields when a collection declares them — an ordinary field a
    site's own schema adds, never a contract A change. A collection that declares none of
    them behaves exactly as it did before this change. `MetadataOptions` gains
    `titleTemplate`/`collectionTitleTemplates` (`%title% — %site%`-style composition, applied
    only to a *derived* title, never to an explicit `seoTitle` override). `isIndexable` now
    also excludes an entry whose collection declares `seoNoindex` and has it switched on, via
    the new exported `isSeoNoindexed` — this is also what keeps a noindexed page out of
    `/sitemap.xml` while it still carries `noindex` in its own `<head>`.
  - `@cogenta/api` gains `createSeoRouter` (`SeoRouter`, `SeoRouterOptions`, `SeoDiagnostics`):
    `POST /api/seo/preview` computes the real head for one unsaved edit (gated by `update` on
    the named collection), and `GET /api/seo/diagnostics` is a site-wide, admin-only report —
    sitemap size and inclusion reasons per collection, `robots.txt`, and content-quality
    anomalies (missing descriptions, titles over 60 characters, duplicate titles, and the
    "published but the sitemap would be empty" class of bug this fiche is named for). Both
    routes call the exact same `buildMetaTags`/`isIndexable`/`isPublished` the public render
    path calls — neither one re-derives anything. `@cogenta/api` gains a new dependency on
    `@cogenta/seo`.
  - `@cogenta/cli` mounts `/api/seo` in `cogenta serve`, next to `/api/redirects` and
    `/api/search`.
  
  All additions are additive and backward compatible: a collection that declares none of the
  conventional SEO fields, and a caller that never sends `titleTemplate`, see no behaviour
  change.

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

- [`db307e0`](https://github.com/cogenta-cms/cogenta/commit/db307e068f4d029d98526c74d0ab9d56e531b73b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add form definitions and submissions — contract G (`forms@1.0`, ADR-0026, fiche 16). A site can now build a form in the admin and receive real submissions, without JavaScript and without an AI provider.
  
  - New package **`@cogenta/forms`**: `FormDefinition`/`FormSubmission` model (nine field kinds — text, longText, email, phone, number, date, choiceSingle, choiceMulti, consent; no `file` field in this first version, a deliberate scope cut), `createFormStore` (definitions CRUD, `submit`/`list`/`markStatus`/`bulkMarkStatus`/`searchByEmail`/`deleteByEmail`/`purgeExpired`), full server-side `validateSubmission` (independent of any client-side check, for every field kind), anti-abuse primitives (`checkHoneypot`, `checkFillDelay`, `checkSubmitRateLimit`), and `notifyNewSubmission`/`sendAutoresponder` — both built on `@cogenta/channels`'s existing email adapter, never a second transport. `ensureFormsTables` follows the same `create table if not exists` shape as `@cogenta/commerce`'s tables — a site that never builds a form still creates them, since (unlike commerce) forms tables are cheap enough not to gate.
  - `@cogenta/core` gains eleven `FORM_*` error codes.
  - `@cogenta/api` gains `createFormsRouter` (`/api/forms/*`): admin-only CRUD on definitions and submissions (bulk mark/delete, unread count, CSV-ready listing, GDPR search/erase by e-mail), plus the CMS's **second public write route**, `POST /api/forms/{name}/submit` — no actor check, its own defences (honeypot, minimum fill delay, per-IP rate limit, full server-side validation) stand in for one. The client's IP is read from the resolved request context, never from a client-supplied `X-Forwarded-For` header — trusting that header would let an attacker rotate it per request and step around the rate limiter entirely. `ShellStatus` gains `formSubmissionsUnread` for the admin's nav badge (additive).
  - `@cogenta/cli` wires it all into `cogenta serve`: `GET /forms/{name}` is the public, no-JavaScript "route dédiée" ADR-0026 chose over a contract B block (a bloc `form` RFC is left open in parallel); a plain HTML form post is answered with a real redirect on success or an accessible re-display of the visitor's own values and per-field error (`aria-invalid`/`aria-describedby`) on failure; notifications reuse the same `FileEmailTransport` already built for account invitations; submissions past a form's own `retainDays` are purged automatically on a daily tick, the same `retainDays`/`purgeExpired` model ADR-0022 established for the trash.
  - Admin (`@cogenta/admin`, private, no changeset): `routes/forms.tsx` (the builder, reusing fiche 03's `RepeaterField` for the field list rather than a second repeater) and `routes/form-submissions.tsx` (list/filter/detail/bulk actions/CSV export via `lib/csv.ts`/GDPR search & erase by e-mail), with an unread-count nav badge.

- [`49815b9`](https://github.com/cogenta-cms/cogenta/commit/49815b95ad87cd37e7781cbb5a726327226259dd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Account lifecycle: invitation by email, search/pagination/bulk actions, a
  self-service public profile, dormant/MFA-recommended signals, and
  irreversible anonymization (fiche 17).
  
  **Breaking (`@cogenta/auth`), in the same pre-1.0 sense the taxonomies/trash
  and redirects changesets already used this bump for**: `User['status']`
  widens from `'active' | 'disabled'` to also include `'invited'` and
  `'anonymized'` — an exhaustive `switch` on the old two-value union needs a
  new case. `User` also gains four new non-optional fields (`displayName`,
  `avatarMediaId`, `bio`, `locale`, all `string | null`) — code that builds a
  `User` object literal by hand (rather than reading one back from
  `UserStore`) needs to add them. `CreateUserInput` gains an optional `status`
  (defaults to `active`, so existing callers are unaffected).
  
  **`@cogenta/auth`**:
  - `UserStore` gains `updateProfile` (self-service, fiche 17 task 3),
    `delete` (real hard delete — safe only for a never-accepted `invited`
    account, see its doc comment for why that does not contradict "accounts
    are disabled, never removed"), and `anonymize` (RGPD-erasure: replaces the
    email with a non-reversible `@anonymized.invalid` token, clears the
    profile fields, sets `status: 'anonymized'`).
  - `SessionStore` gains `lastSeenByUser()` — the last activity timestamp for
    every account in one query, across every session ever held (revoked and
    expired included), for the "last sign-in" column and the dormant-account
    signal.
  - `PasswordResetStore` gains `pending(userId)` — the still-usable token for
    a user, if any, without ever returning the token itself. Used by fiche
    17's invitation to answer "invitation sent on …" and to support resend.
  - New table columns on `cogenta_users` (`display_name`, `avatar_media_id`,
    `bio`, `locale`), added the same additive, catch-and-ignore way the API
    key lifecycle columns were.
  - New error codes: `AUTH_INVITE_UNAVAILABLE` (503), `AUTH_INVITE_INVALID_STATE`
    (409), `AUTH_ACCOUNT_ANONYMIZED` (409), `AUTH_ANONYMIZE_CONFIRMATION_MISMATCH`
    (400).
  
  **`@cogenta/api`**: `users-router.ts` grows substantially, entirely additive
  at the route level —
  - `POST /api/users` accepts `invite: true`. With `onInvite` wired, it
    creates an `invited` account and hands the invitation token to the
    callback instead of returning a password — the same single-use token
    primitive `/forgot-password` already uses, reused rather than
    reimplemented. Without `onInvite` wired (or the flag omitted), the route
    behaves exactly as it always has: a generated password, shown once (R1's
    mandatory fallback). The response gains `invited`/`emailSent` alongside
    the (now optional) `password`.
  - `GET /api/users` gains `?sort=`, `?after=`, `?limit=`, and a substring
    match on display name as well as email for `?q=`. The response gains
    `page: { hasMore, nextCursor }` and `meta: { invitationEmailAvailable }`
    — `data` is unchanged.
  - `POST /api/users/{id}/invite` (resend) and `DELETE .../invite` (cancel —
    a real delete, safe for the reason above) are new.
  - `POST /api/users/bulk` (`disable`/`enable`/`setRoles` over several ids at
    once, `Promise.allSettled`, a report naming every failure) is new.
  - `PATCH /api/users/me/profile` (self-only, mirrors the existing
    self-only `/me/password`) is new.
  - `POST /api/users/{id}/anonymize` (admin-only, confirmed by typing the
    account's current email, refuses the last active admin the same way
    disabling one already did, writes one `user.anonymize` audit entry that
    never carries the erased address) is new.
  - `auth-router.ts`'s `POST /api/auth/reset-password` gains one line: an
    `invited` account is flipped to `active` the moment its token is
    redeemed — the only place in the product that changes that bit, and the
    reason the invitation never needed a second token type.
  - `statusFor()` gains the four new codes above.
  
  **`@cogenta/cli`**: `cogenta serve` wires the users router's `collections`
  (for the MFA-recommended signal) and a new `onInvite` callback, delivered
  through a new `invite-mail.ts` (the file-transport email, sibling to the
  existing `reset-mail.ts`) pointed at the same `/admin/reset-password` screen
  `onForgotPassword` already uses — accepting an invitation and resetting a
  forgotten password redeem the identical token type.
  
  Tests: `@cogenta/auth` 189 (19 new), `@cogenta/api` 582 (78 new across
  `users-router.test.ts` and `auth-router.test.ts`), `@cogenta/cli` 236 (11
  new in `test/serve-users.test.ts`, end to end over real HTTP against a real
  mail directory — invite, read the mail, redeem, sign in; single-use and
  expiry; resend/cancel; bulk actions; self-service profile; anonymization
  with audit-log coherence). `@cogenta/admin` (private, no changeset) gains
  26 new UI tests across `test/users/users.test.tsx` and
  `test/users/profile.test.tsx`.

- [`122da7a`](https://github.com/cogenta-cms/cogenta/commit/122da7ad20396966b4d44538b0842f8efb9b7621) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 18 (profile and authentication): TOTP recovery codes, readable sessions
  with bulk sign-out, an account's own activity feed, and a fetchable password
  policy.
  
  **`@cogenta/core`** gains two error codes: `AUTH_RECOVERY_CODE_INVALID` and
  `AUTH_RECOVERY_CODES_UNAVAILABLE`.
  
  **`@cogenta/auth`** (the priority of this fiche): confirming TOTP enrolment
  now mints ten single-use recovery codes in the same step and hands them back
  — `confirmTotpEnrolment` returns `Promise<RecoveryCodesIssued>` instead of
  `Promise<void>`. New `AuthService` methods: `recoveryCodeLogin`,
  `regenerateRecoveryCodes`, `recoveryCodesStatus`. `passwordLogin`, `totpLogin`
  and `completeWebAuthnLogin` accept an optional `LoginContext` (`userAgent`,
  `ttlMs`) for "remember me" and readable sessions. `SessionStore` gains
  `revokeAllExcept` ("sign out everywhere else") and every session now reports
  a `browser`/`device` pair distilled from the `User-Agent` at creation —
  never the raw header, never an IP address. `CredentialStore` gains
  `setRecoveryCodes`/`recoveryCodesStatus`/`consumeRecoveryCode`/`removeRecoveryCodes`.
  New exports: `generateRecoveryCodes`, `hashRecoveryCode`, `verifyRecoveryCode`,
  `normaliseRecoveryCode`, `RECOVERY_CODE_COUNT`, `parseUserAgent`,
  `ParsedUserAgent`, `LoginContext`, `RecoveryCodesIssued`. Consumption is a
  real compare-and-set on the stored batch (the same idiom `resets.ts` already
  used for password-reset tokens), with a bounded retry against the fresher row
  on a lost race — proven under genuine two-connection SQLite concurrency, code
  by code, in `packages/auth/test/recovery-code-concurrency.test.ts`, alongside
  a naive-control test showing the read-then-write shape it replaces really
  would let one code work twice.
  
  **Breaking, honestly**: `confirmTotpEnrolment`'s return type change and the
  new required members on `SessionStore`/`CredentialStore` are real breaks for
  anyone who type-pinned the old signatures or hand-rolled an implementation of
  either store interface — real callers of `createAuthStore`/`createAuthService`
  (the only supported way to get one) are unaffected. Marked `minor` rather than
  `major` per this project's existing 0.x convention (no package has used
  `major` yet, and one now would jump straight to `1.0.0`, which contradicts
  "pre-alpha") — human judgement invited to confirm.
  
  **`@cogenta/api`**: new routes `POST /api/auth/recovery-code`,
  `GET /api/auth/password-policy`, `GET /api/auth/totp/recovery-codes`,
  `POST /api/auth/totp/recovery-codes/regenerate`, `POST
  /api/users/me/sessions/revoke-others`, and `GET /api/audit/me` (the one audit
  route open to a non-admin — force-scoped server-side to the caller, never a
  client-supplied id). `POST /api/auth/totp/enrol/confirm`'s response gains
  `recoveryCodes`; `GET /api/users/{id}/sessions` entries gain `browser`,
  `device` and `isCurrent`. New export: `createRecoveryCodeUsedNoticeSource`
  (the security notice a recovery-code sign-in triggers).
  
  **`@cogenta/cli`**: `cogenta serve` wires all of the above — the new notice
  source is registered, and a recovery-code sign-in is recorded in the audit
  log as `auth.recovery_code_used` instead of the generic `auth.login`.

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

- [`95acedf`](https://github.com/cogenta-cms/cogenta/commit/95acedf48920dba08e443e56ca4464bcfd394d34) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Analytics drill-down (fiche 27): pages, referrers, period comparison, custom
  date range, entry-editor stats, CSV export, and configurable, automatically
  purged retention — the gaps found against Jetpack Stats/Plausible/Matomo. No
  new field is collected: every addition is computed from the events row this
  package already wrote (path, referrer domain, device, daily-salted session
  hash), so the site's cookie-free, no-consent-banner posture is unchanged.
  
  **`@cogenta/analytics`**: `AnalyticsStore.getSummary` now returns
  `previousTotalViews`/`previousUniqueVisitors`/`viewsChangePercent` — the
  equal-length window immediately before the requested one, with `null` (never
  a misleading `0`) when there is no previous traffic to compare against.
  `getPageStats(path, window)` reports one page's views, previous-period views
  and rank among every path seen in the window — what an entry-editor sidebar
  needs, without pulling the whole top-N list. `purgeEvents(retainDays)` and
  `purgeSalts(retainDays)` delete rows past a configured retention; the events
  table is the largest table on a site with real traffic, and there is no way
  to disable purging outright, only to choose how long to keep.
  
  **`@cogenta/core`**: new config section `analytics.retainDays` (default 400
  days), resolved alongside every other site setting.
  
  **`@cogenta/api`**: `createAnalyticsRouter`'s `GET /api/analytics/summary`
  accepts a custom `?since=&until=` range (alongside the existing `?days=`),
  reports the period-over-period comparison, and — when the caller wires in
  `resolvePage` — enriches each top page with its entry's title and admin edit
  link. A new `GET /api/analytics/page?path=` answers the same admin-only stats
  for one page. `retainDays`, when wired in, is echoed back as `retentionDays`
  so the admin screen can show a real number instead of a promise.
  
  **`@cogenta/cli`**: `cogenta serve` wires the new `analytics.retainDays`
  config into a daily purge tick (same shape as the existing scheduled-publish
  tick — a sweep right away, then one every 24h) and resolves top pages against
  the site's real routes and permission-checked content gateway, so the summary
  screen can link straight to the entry in the admin.
  
  Purely additive: a site that never reads `/api/analytics/summary` behaves
  exactly as before.

- [`6e5df34`](https://github.com/cogenta-cms/cogenta/commit/6e5df34e6f428c36712bc80e76c37d0cd7e33b1c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 29 — the marketplace gains a real "installed extensions" screen: what
  runs, in which version, with which permissions, and how it's been behaving.
  
  **Breaking, in the pre-alpha sense already established for this project (no
  package has ever used `major`, and one would jump straight to `1.0.0`,
  contradicting "pre-alpha"; the breaking shape is called out here instead):**
  `@cogenta/plugins`' `MarketplaceInstallRecord` gains a required `enabled`
  field, and `MarketplacePreview` gains required `engineCompatible`,
  `latestVersion` and `source` fields — anyone constructing these shapes by
  hand (a test double, a custom `MarketplaceInstaller` implementation) needs
  those fields too. `MarketplaceInstaller` gains two new required methods,
  `activate`/`deactivate`, and `uninstall`'s signature grows an optional
  `{ removeData?: boolean }` second argument. `@cogenta/api`'s
  `marketplace-router.ts` mirrors the same shapes structurally, as it always
  has.
  
  New, additive:
  
  - `@cogenta/plugins`: `createPluginUsageStore` (`permissions/usage.ts`) —
    accumulates real per-run duration, call count, and outcome (ok / error /
    timeout / memory / crash) per plugin, fed by `runPlugin` when given a
    `usageStore` option. `IsolatedRunResult` gains a real, always-present
    `durationMs`. `PluginGrantStore` gains `revokeAll`. The marketplace
    installer gains a manual `enabled` toggle (`activate`/`deactivate`,
    independent of `PluginDisableStore`'s automatic timeout/memory/crash
    disable), an `engineVersion` option that refuses an incompatible install
    or update with the new `MARKETPLACE_ENGINE_INCOMPATIBLE` code (only once a
    caller actually configures a real Cogenta version — the placeholder
    default never fabricates a refusal), and `uninstall(id, { removeData:
    true })`, which also revokes grants and clears the disable/usage records.
    `MarketplaceCatalogEntry` gains an optional `author`, and
    `MarketplaceChangelogEntry` an optional `releasedAt`.
  - `@cogenta/api`: `GET /api/marketplace/installed` (capabilities, disabled
    state, usage, update availability, per item), `GET /api/marketplace/updates`
    and `POST /api/marketplace/updates/apply` (grouped update that always
    skips — never silently applies — anything that would widen permissions),
    `POST /api/marketplace/items/{id}/activate` and `.../deactivate`,
    `POST .../uninstall` now accepts `{ removeData: boolean }` in its body.
  - `@cogenta/core`: new `MARKETPLACE_ENGINE_INCOMPATIBLE` error code, mapped
    to a `422` in `@cogenta/api`'s `statusFor`.
  
  Honest limitation, not an oversight: nothing in this repository actually
  calls `runPlugin` yet (no live `AgentRegistry` exists anywhere, the same
  R2-honest gap already noted since L5) — the new usage store is real, tested
  end to end, and wired into `cogenta serve`, but stays empty on a real
  deployment until a real plugin-execution pipeline lands. The installed
  extensions screen says "never run yet" rather than inventing a number.

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

- [`4513a71`](https://github.com/cogenta-cms/cogenta/commit/4513a71a15dfa7a716bf9c8fcd02f93df927f230) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Import gains a real preview/apply/undo flow (fiche 25), on top of the existing
  one-shot WordPress uploader, which is unchanged and still works.
  
  `@cogenta/import`:
  - `analyzeWordPress(xml)` previews a WXR export — counts, proposed collection mapping,
    authors, media URLs and volume, slug conflicts and everything that will be skipped —
    without writing anything.
  - `importWordPress` accepts `{ tracking, runId }`: passed, every post/page/comment it
    writes is recorded, a second call with the same `runId` resumes without duplicating,
    and `undoImport` can trash everything the run created (never `purge`, so an
    over-eager undo is itself reversible from the trash).
  - New sources: `parseCsv`/`csvToRecords` (zero dependency, RFC 4180), `feedToRecords`
    (RSS 2.0 and Atom), `parseJsonImport`/`analyzeJson`/`applyJson` (a minimal Cogenta
    JSON import format). CSV and RSS/Atom share a generic mapping/apply engine
    (`analyzeGeneric`/`applyGeneric`, `proposeFieldMapping`/`resolveMapping`) against any
    collection the target site declares — real field correspondence, not a fixed shape.
  - `createImportTrackingStore` — two new tables (`cogenta_import_runs`/
    `cogenta_import_items`), owned entirely by this package, never a field on contract A.
  - Outbound media downloads are now guarded against SSRF (private/loopback/link-local
    addresses refused, including on a DNS-rebound host name), capped in size and count,
    and time out.
  
  `@cogenta/core`: new error codes (`IMPORT_RUN_NOT_FOUND`, `IMPORT_SOURCE_INVALID`,
  `IMPORT_ALREADY_APPLIED`, `IMPORT_MAPPING_INVALID`, `IMPORT_MEDIA_URL_UNSAFE`,
  `IMPORT_CSV_INVALID`, `IMPORT_FEED_INVALID`).
  
  `@cogenta/api`: `createImportRouter` gains `POST /api/import/analyze`,
  `GET /api/import/runs`, `GET /api/import/runs/{id}`, `POST /api/import/runs/{id}/apply`
  and `POST /api/import/runs/{id}/cancel`, behind five new optional `ImportRouterOptions`
  callbacks (`analyze`/`apply`/`getRun`/`listRuns`/`cancel`). All admin-only. The legacy
  `POST /api/import/wordpress` route is untouched.
  
  `@cogenta/cli`: `cogenta serve` wires the full flow — WordPress, CSV, JSON and RSS/Atom
  — through the site's own stores, storage driver and read-only guard.

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

- [`b50f7bb`](https://github.com/cogenta-cms/cogenta/commit/b50f7bba14a3d749ffb330eed300bd69e9f8d837) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 35 (coquille et navigation): the admin sidebar is now grouped by
  domain (Contenu, Apparence, Boutique, IA, Comptes, Exploitation,
  Réglages) and filtered by role, active features (a shop-less site has
  no Boutique group) and available capabilities (no AI provider reduces
  the IA group to its explanation page) — a contributor sees six entries
  instead of twenty-three. Adds a collapsible/responsive sidebar with a
  mobile drawer, aggregated badges (trash count, orders to process) from
  one request rather than one per badge, a breadcrumb with a
  per-navigation `document.title`, and `⌘K`/`Ctrl+K` command-palette
  actions on top of the existing search. `@cogenta/api` gains
  `createShellStatusRouter` (the single aggregated status read the
  badges and feature gates use). `@cogenta/cli`'s `theme-render.ts`
  renders a thin "edit this page" admin bar on the public site for an
  authenticated visitor only, never for an anonymous one.

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

- [`421cf33`](https://github.com/cogenta-cms/cogenta/commit/421cf33e57f8922e94506275cd724d5ce1639ff6) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve` now actually sweeps the trash. `purgeExpired()` has existed on
  every `ContentStore` since ADR-0022, but nothing called it — a site's trash
  grew forever despite `trash.retainDays` implying otherwise. `runServe` now
  ticks it once at startup and then on a daily `setInterval` (override with
  `trashPurgeTickMs`, mirroring `scheduledPublishTickMs`), one collection's
  expired rows at a time, never fatal per collection.
  
  `createOpsStatusRouter` gains an optional `trash` provider and a third route,
  `GET /api/trash-status` (admin-only, same as `/api/security-status` and
  `/api/webhooks-status`): `{ retainDaysByCollection, lastRunAt, lastPurged }`,
  so an admin screen can say when the sweep last ran instead of only that it is
  configured to happen. A caller that does not wire `trash` gets an honest
  all-empty answer instead of a crash.
  
  Fixes a real gap in the audit log: `POST .../untrash`, `POST .../purge`,
  `POST .../unpublish` and `POST .../duplicate` were silently unaudited —
  `recordContentAudit` only ever recognised `publish` and `restore` among
  sub-actions, treating every other one as a read. All four now record
  `content.untrash`, `content.purge`, `content.unpublish` and
  `content.duplicate` respectively.

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

- Updated dependencies [[`54ca689`](https://github.com/cogenta-cms/cogenta/commit/54ca6894449fcdd29ff76eef4514cda7c081f483), [`0692713`](https://github.com/cogenta-cms/cogenta/commit/06927130c15f7bc95ea97839cb50f67de87bd668), [`36744d3`](https://github.com/cogenta-cms/cogenta/commit/36744d3bc8e74a39fa6c68bdd78804fad1d8f069), [`7b7ec0b`](https://github.com/cogenta-cms/cogenta/commit/7b7ec0b897735c1323bb733ae6ba76a522f72669), [`0ca8a79`](https://github.com/cogenta-cms/cogenta/commit/0ca8a797288624a3c4d53ca0942687d9e570b186), [`c392e24`](https://github.com/cogenta-cms/cogenta/commit/c392e24880a29388fc63a08388042bf163817619), [`967ec5a`](https://github.com/cogenta-cms/cogenta/commit/967ec5a64a85ef0030a764e72a151a8bc8edfca6), [`562c9c1`](https://github.com/cogenta-cms/cogenta/commit/562c9c1ee4d52b3e7f624e3b54ae033c2bd01e1c), [`edf5623`](https://github.com/cogenta-cms/cogenta/commit/edf562389652c4f6afb58d6e3f166de233d063e2), [`db307e0`](https://github.com/cogenta-cms/cogenta/commit/db307e068f4d029d98526c74d0ab9d56e531b73b), [`49815b9`](https://github.com/cogenta-cms/cogenta/commit/49815b95ad87cd37e7781cbb5a726327226259dd), [`122da7a`](https://github.com/cogenta-cms/cogenta/commit/122da7ad20396966b4d44538b0842f8efb9b7621), [`2fb2101`](https://github.com/cogenta-cms/cogenta/commit/2fb210109824f000788d512fef748f1066f65551), [`0e90b32`](https://github.com/cogenta-cms/cogenta/commit/0e90b32c19247430987e84cc1fd0be57e1ad4f3e), [`d0bfa1d`](https://github.com/cogenta-cms/cogenta/commit/d0bfa1d71166adfb0c66a296c4cf490ddd58a218), [`95acedf`](https://github.com/cogenta-cms/cogenta/commit/95acedf48920dba08e443e56ca4464bcfd394d34), [`6e5df34`](https://github.com/cogenta-cms/cogenta/commit/6e5df34e6f428c36712bc80e76c37d0cd7e33b1c), [`bebbab8`](https://github.com/cogenta-cms/cogenta/commit/bebbab881761fb86a28cdbbcb95b5960429f2a29), [`e75b23e`](https://github.com/cogenta-cms/cogenta/commit/e75b23ec985099f2eabe6eabb7b4c86115006996), [`4513a71`](https://github.com/cogenta-cms/cogenta/commit/4513a71a15dfa7a716bf9c8fcd02f93df927f230), [`e8061e2`](https://github.com/cogenta-cms/cogenta/commit/e8061e24ec41e9a99f5c852c28649f62656b0cc9), [`54409f3`](https://github.com/cogenta-cms/cogenta/commit/54409f3ff4640518d5d4149bef73a29142ba0d0a), [`f47e893`](https://github.com/cogenta-cms/cogenta/commit/f47e893b3e2b674b028af54d2146c7e83c32617c), [`2285720`](https://github.com/cogenta-cms/cogenta/commit/2285720ae29de05e96a8d776fd5ae14f2fe4fd0d), [`46572ba`](https://github.com/cogenta-cms/cogenta/commit/46572bae836b8182c2a3563e8f0e2da74d7e82ee), [`2c1af5d`](https://github.com/cogenta-cms/cogenta/commit/2c1af5d8ec08b460ba80a2228ceca6f4ff89eef2), [`745ebd8`](https://github.com/cogenta-cms/cogenta/commit/745ebd8f80ea94d916a370af0f9615e6565c0d00), [`9e67928`](https://github.com/cogenta-cms/cogenta/commit/9e67928b4b2fd58cc4e72f42f7a265aac8460567), [`954460e`](https://github.com/cogenta-cms/cogenta/commit/954460e63748a58c47d28292b1691425775b7e36), [`3824e8e`](https://github.com/cogenta-cms/cogenta/commit/3824e8e043e5d4036a47bd1e0b9d86c44c45a5a7)]:
  - @cogenta/core@0.5.0
  - @cogenta/auth@0.4.0
  - @cogenta/schema@0.4.0
  - @cogenta/seo@0.3.0
  - @cogenta/forms@0.2.0
  - @cogenta/analytics@0.3.0
  - @cogenta/channels@0.2.2
  - @cogenta/blocks@0.1.5

## 1.1.0

### Minor Changes

- [`fa3d13b`](https://github.com/cogenta-cms/cogenta/commit/fa3d13beb1d7394010dcb77e6bab0efbb07e3f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Global search in the admin header (L11 task 4). `GET /api/media` and
  `GET /api/users` both gain an optional `q` query parameter: a case-insensitive
  substring match on filename/alt text for media, and on email for accounts.
  
  Neither gets a real index — `q` filters in memory over a bounded scan (the
  most recent 200 assets for media, the full account list for users, which the
  route already loaded in full). Good enough for the volume an admin media
  library or account list holds today; a real index is `@cogenta/schema`'s
  search engine (`GET /api/search`, unchanged here), built for content.
  
  Both routes keep the permission check they already had *before* applying the
  filter: `/api/media` still requires a signed-in actor, `/api/users` still
  requires the `admin` role. `q` narrows what an already-permitted caller sees,
  it never widens it (R4).
  
  The admin's new global search box (topbar, `packages/admin/src/shell/`) calls
  `/api/search`, `/api/media` and `/api/users` in parallel — three real calls
  rather than one aggregated route, since aggregating server-side would still
  make the same three calls internally for no real benefit.

- [`3b04c56`](https://github.com/cogenta-cms/cogenta/commit/3b04c56ca17291732a1e3f61cfa3b07248708a19) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `unpublish` and `duplicate` REST routes, so the admin's editor can
  finally offer status control and duplication
  
  The audit's top finding on the admin: the content editor had no publication
  control at all, even though `POST /{collection}/{id}/publish` has existed
  since L2. Fixing that needed two more routes, both added the same way the
  existing ones were:
  
  - `POST /{collection}/{id}/unpublish` — the direct inverse of `publish`, so
    it is guarded by the `publish` action rather than a sixth verb (contract A's
    action vocabulary stays frozen at five, same reasoning `untrash`/`purge`
    reuse `delete`). Body: `{ status?: 'draft' | 'archived' }`, defaulting to
    `draft`.
  - `POST /{collection}/{id}/duplicate` — wires up `ContentStore.duplicate()`
    (`@cogenta/schema`), which was already written and tested but never called
    by anything. Guarded by `create`, since a duplicate is a new entry, not a
    change to the source. Body: `{ values?: {...} }`, applied on top of the
    copied values (the same override contract `duplicate()` already exposes).
  
  Both are tested role by role (refused for a role without the permission,
  allowed for one with it) in `test/rest/publish-duplicate.test.ts`.
  
  `@cogenta/admin`'s entry editor now shows a visible status control
  (draft/published/archived) and a "Publish" button gated by the `publish`
  permission, plus a "Duplicate" button gated by `create` — both calling these
  routes. `@cogenta/admin` is unpublished, so no changeset entry for it.
  
  Deliberately not done here: a fourth `scheduled` status in the admin. Contract
  A already has it, and `@cogenta/schema` has a full queue-based scheduler for
  it (`src/scheduling/publish.ts`), but nothing registers it in `cogenta serve`
  — offering a date picker that silently did nothing would be dishonest UI.
  Wiring the scheduler is separate follow-up work.

- [`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Self-hosted, cookie-free page-view analytics — the one CMS feature category
  the audit found completely missing. No third party, no cookie, no personal
  data ever stored, consistent with R1 (no dure dependency on external
  infrastructure) and the project's privacy stance.
  
  **New package `@cogenta/analytics`.** One table (`cogenta_analytics_events`):
  timestamp, page path, referring **domain only** (never the full referrer
  URL), a device category reduced from the User-Agent (`desktop`/`mobile`/
  `tablet`/`other`, never the raw string), and a **daily-salted session hash**
  — never an IP address, never a cookie. The salt (`cogenta_analytics_daily_salts`)
  is minted once per UTC day and rotates every day, so
  `sha256(salt|ip|device)` for the same real visitor is a *different*, unrelated
  value on every new day: nothing in the stored data can link two days of the
  same visitor's traffic, even with full database access, because reproducing
  yesterday's hash needs yesterday's IP, which was never written down. The IP
  address and the full User-Agent are used only as transient inputs to that
  hash and to the device classifier — neither is ever persisted. A dedicated
  privacy test suite (`test/privacy.test.ts`) inspects the actual stored
  columns, not just the public types, to prove this. `createAnalyticsStore`
  aggregates views by day, top pages, top referring domains and device
  breakdown; a same-session rate limit (60 events/minute) drops abusive
  traffic silently rather than erroring.
  
  **`@cogenta/core`** gains one error code, `ANALYTICS_SALT_UNAVAILABLE`
  (an internal race-recovery failure, not expected in normal operation).
  
  **`@cogenta/api`** gains `createAnalyticsRouter`: `GET /api/analytics/beacon`
  (public, records one event, always answers `204` even on a malformed or
  rate-limited request — a public collection endpoint must never break page
  rendering) and `GET /api/analytics/summary` (`admin`-only, `?days=` window).
  
  **`@cogenta/cli`** wires both into `cogenta serve` and injects the collection
  tag into every rendered page. The tag is an invisible `<img>` pixel, not a
  `<script>`: the theme's rendered output already carries a hard "zero
  executable client JavaScript" property (enforced by a `serve.test.ts`
  assertion), so a script reading `document.referrer` was not an option. The
  referrer is instead read **server-side**, from the `Referer` header of the
  request that is rendering the page, and baked straight into the pixel's URL
  — no client code needed to capture it. The page builder's live-preview
  render includes the same pixel (rather than omitting it) specifically to
  keep its `<body>` byte-identical to the published page's, the invariant
  `theme-render-fidelity` depends on.
  
  The admin gains a full `/analytics` dashboard (hand-built SVG bar chart, no
  charting dependency — R9) and a "views this week" widget on the main
  dashboard, both `admin`-only like every other traffic-shaped view in the
  admin.

- [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - API keys, wired to the transport (L13 task 8, companion to the
  `@cogenta/auth` changeset that adds the store).
  
  `resolveActor` now recognises two bearer-token shapes instead of one: a
  session (unchanged) and an API key, told apart by the key's `cogenta_sk_`
  prefix before any database lookup runs. A key resolves to an actor whose
  `roles` are exactly its granted `scope` — never more, and never derived from
  whoever created it — with an id prefixed `apikey:` so it can never collide
  with, or be mistaken for, a real user id in the audit log or a `me` route.
  Repeated attempts with an invalid key are rate-limited the same way a wrong
  password is, keyed on a hash of the attempted key since an unrecognised key
  carries no other identity to limit by.
  
  `@cogenta/api` gains `createApiKeysRouter` — `GET`/`POST /api/api-keys` and
  `DELETE /api/api-keys/{id}`, admin-only. The raw key is present in exactly
  one response body, `POST`'s, and never again: `list()` only ever returns the
  12-character prefix a key was minted with.
  
  `@cogenta/cli` mounts the router in `cogenta serve` under `/api/api-keys`
  and records `apikey.create`/`apikey.revoke` in the audit log, the same
  transport-boundary pattern `recordUserAudit` already uses — the raw key
  never reaches the audit entry, only the key's id.
  
  **The admin screen for managing keys lands in the same session**
  (`@cogenta/admin`, unpublished/private, no changeset needed) — a new
  `/api-keys` route, admin-only, that shows the raw key exactly once in a
  dismissable notice right after creation and never again afterwards.
  
  Compromise taken under time pressure, noted rather than hidden: scope is a
  flat list of role names rather than a collection-by-collection permission
  matrix. A key's actor is checked by the same `PermissionLayer` every other
  actor is, so a key can never do more than the roles it was granted allow —
  the simplification is in how finely a grant can be sliced, not in whether it
  is enforced.

- [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The other half of password reset (`.changeset/auth-password-reset.md`,
  L13 task 6): that changeset built the store and the terminal command and
  said plainly "no admin route can receive a reset click yet". This is that
  route, and the screen behind it.
  
  `@cogenta/auth`'s `AuthStore` gains a `resets` field — the
  `PasswordResetStore` `createPasswordResetStore` already built, now wired
  into the object every caller already holds, the same way `rateLimit` and
  `sessions` are.
  
  `@cogenta/api`'s `createAuthRouter` gains two routes. `POST
  /api/auth/forgot-password` accepts an email and answers with the **exact
  same response** whether or not an account exists for it — the line this
  route exists to never cross is account enumeration, and every branch of its
  handler (an existing account, a disabled one, a non-existent one) returns
  byte-identical bodies. It rate-limits by the submitted email, before the
  account lookup, on the same subject either way, the same posture
  `loginAttempts` already applies to a wrong password. Only a real, active
  account gets a token issued, delivered through a new optional
  `onForgotPassword` callback rather than a hard dependency on
  `@cogenta/channels` (R9) — the router itself never sends mail. `POST
  /api/auth/reset-password` redeems the token, sets the new password (same
  12-character floor as the self-service password-change route, now shared
  from a new `password-policy.ts` instead of duplicated), and revokes every
  existing session, exactly like `cogenta users reset-password --token`
  already does. A new error code, `AUTH_RESET_TOKEN_INVALID` (400), names an
  invalid, expired or already-used token — unlike `forgot-password`, this
  route's refusal is allowed to say why, since the secret here is the token
  itself, not whether an email exists.
  
  `@cogenta/cli` factors the mail-sending half of `cogenta users
  reset-password --email` out of `commands/users.ts` into a new shared
  `reset-mail.ts`, so `cogenta serve` can wire the identical wording (now with
  an optional link to the admin's reset screen instead of the terminal
  command) into `onForgotPassword` without a second copy of it. `runServe`
  passes it to `createAuthRouter` unconditionally: the token is still issued
  and thrown away unsent when no site's mail is configured to go anywhere
  useful, since the HTTP response must never depend on whether the mail could
  be delivered.
  
  `@cogenta/admin` (private, no changeset) gains the two screens this needed:
  "forgot password" on `/forgot-password`, linked from the sign-in screen, and
  "reset password" on `/reset-password?token=…`, the link the mail sends. Both
  are public routes, like `/login`. The user-management screen's role editor
  also moves off a raw comma-separated text field: four standard role names
  (`admin`/`editor`/`author`/`contributor`) are now offered as checkboxes,
  alongside any role a site's accounts already use, plus a free-text field for
  a role of the site's own — a UX convention only, not a contract A change
  (a role is still an arbitrary string as far as the server and the five
  permission actions are concerned).

- [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L17 tasks 1-4: a local/embedded marketplace catalog with one-click install,
  scoped deliberately without a real remote registry service — L13 task 8 (API
  keys), which the lot names as the dependency for a distant marketplace, was
  never built in this repository.
  
  `@cogenta/plugins` gains `createMarketplaceCatalog` (an in-memory, searchable,
  category-filterable directory the caller assembles — not a fetch to any
  external host) and `createMarketplaceInstaller`, plus `loadMarketplacePlugin`:
  a stricter sibling of `loadPlugin` that treats every reference as
  `registry`-trust unconditionally, so a marketplace item never takes the
  `local`/dev-mode shortcut that would otherwise skip signature verification for
  a catalog entry that happens to point at a local directory.
  
  **The one line the whole task hinges on**: `MarketplaceInstaller.install`
  always calls `loadMarketplacePlugin`, which always verifies signature against
  the trusted registry keys — there is no parameter anywhere in this path that
  can skip that call, and a missing or invalid signature throws before anything
  is persisted. Only `kind: 'plugin'` installs for now (`MARKETPLACE_KIND_UNSUPPORTED`
  otherwise) — themes/skins/skills keep using their own existing registries
  (`createThemeRegistry`/`createSkinGallery`/`createSkillRegistry`).
  
  `MarketplaceInstaller.update` re-verifies the signature of the new reference,
  computes newly-declared capabilities against the plugin's existing grants
  (`detectCapabilitiesNeedingApproval`, unchanged from L7), and refuses
  (`MARKETPLACE_UPDATE_REQUIRES_APPROVAL`) unless the caller explicitly passes
  `confirmPendingPermissions: true` — and even then, no capability is
  auto-granted; `PluginGrantStore.grant` stays a separate, explicit step.
  
  `@cogenta/api` gains `createMarketplaceRouter` (`/api/marketplace/items`,
  admin-only, structurally typed against `@cogenta/plugins` rather than
  depending on it at runtime) with list/detail/install/update/uninstall routes.
  The detail route reuses `describeCapability` (L7 task 7) so a plugin's
  requested capabilities read in plain language, the same sentences the
  existing permission-review screen already renders.
  
  `@cogenta/core` gains the error codes this needs:
  `MARKETPLACE_ITEM_NOT_FOUND`, `MARKETPLACE_KIND_UNSUPPORTED`,
  `MARKETPLACE_ALREADY_INSTALLED`, `MARKETPLACE_NOT_INSTALLED`,
  `MARKETPLACE_UPDATE_REQUIRES_APPROVAL` — and `PLUGIN_SIGNATURE_MISSING`/
  `PLUGIN_SIGNATURE_INVALID`/`PLUGIN_SOURCE_NOT_FOUND`/`PLUGIN_MANIFEST_INVALID`
  (existing L7 codes, never before mapped to an HTTP status because no REST
  route threw them until now) gain entries in `statusFor` (422/404/422).
  
  **Not done, by explicit scope cut under a hard deadline**: `cogenta serve`
  does not yet mount this router, so the catalog/installer above are complete,
  independently tested, and ready to wire, but not yet reachable over HTTP from
  a running site — the same honest gap the codebase already tolerates elsewhere
  (`cogenta build`/`deploy`/`theme`, L9 task 9) rather than a stub. Bundled
  updates across multiple items and the commercial (paid extension) track named
  in the lot doc are both out of scope for this pass.

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

- [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give the redirect table, HTTP security and outbound webhooks a real admin
  screen (audit follow-up to L10 tasks 2/6 and L14 task 1)
  
  Three backend pieces existed and were fully wired into `cogenta serve` with
  no way to reach them from a browser.
  
  - `@cogenta/core` gains the `REDIRECT_UNKNOWN` error code, for a `DELETE` on a
    redirect that does not exist.
  - `@cogenta/api` gains `createRedirectRouter` (`GET`/`POST`/`DELETE
    /api/redirects`) and `createOpsStatusRouter` (`GET /api/security-status`,
    `GET /api/webhooks-status`). Both are admin-only on every method, including
    `GET`: a redirect table and a site's CORS/CSP/HSTS configuration are
    routing and hardening decisions, not content, so neither has a reader role
    the way a taxonomy or a menu does. Loop and self-redirect refusal is
    entirely `RedirectStore`'s own job (`CONTENT_REDIRECT_LOOP`,
    `CONTENT_ROUTE_INVALID`), surfaced here as a proper 409/400 instead of a
    500.
  - `cogenta serve` mounts all three at `/api/redirects`, `/api/security-status`
    and `/api/webhooks-status`, and `@cogenta/admin` gains three screens:
    `/redirects` (full CRUD) and `/ops-settings` (`security` and `webhooks`,
    **read-only**).
  
  The security and webhooks screens are read-only by design, not by omission.
  Both settings live in the site's `cogenta.config.mjs` — versioned in git,
  deployed with the code that depends on it (a CSP that allows a script host
  has to travel with the deploy that added the script). Letting the admin edit
  them would create a second source of truth that disagrees with the file the
  moment either one changes without the other, which is a bigger architecture
  change than this audit's scope. The screens instead mirror exactly what the
  running process is enforcing on every request.
  
  No delivery history is shown for webhooks: none is persisted anywhere today
  (`WebhookEventSender.send` only ever returns a per-call result to log). The
  screen says so rather than inventing one.

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

- [`71e1dcd`](https://github.com/cogenta-cms/cogenta/commit/71e1dcd3f8204dca3b05cfd8558e7cf39aedc9e8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - WordPress import from the admin, not only `cogenta import wordpress` on a
  terminal. `@cogenta/api` gains `createImportRouter` (`POST
  /api/import/wordpress`), and `cogenta serve` mounts it — admin-only, checked
  before the (potentially multi-megabyte) upload body is even read, the same
  defensive order `/api/site-plans` already uses for the same reason.
  
  The import logic itself is not duplicated: the router takes an injected
  `runWordPressImport` function, and `cogenta serve` wires it to
  `@cogenta/import`'s real `importWordPress`, unchanged — `@cogenta/api` gains
  no new dependency, the same shape rule `MediaRouterOptions.images` already
  follows. A successful import is recorded in the audit log
  (`import.wordpress`) with the counts, never the document itself.
  
  The admin gets a screen at `/import`: choose a WordPress "Export All Content"
  file, and see the same report `cogenta import wordpress` already prints — what
  was imported, what was skipped, and what could not be converted to a block.

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944)]:
  - @cogenta/analytics@0.2.0
  - @cogenta/core@0.4.0
  - @cogenta/auth@0.3.0
  - @cogenta/schema@0.3.0
  - @cogenta/blocks@0.1.4

## 1.0.0

### Major Changes

- [`b8ed3cf`](https://github.com/cogenta-cms/cogenta/commit/b8ed3cfca3f7b84e5454ffeb357edbe970afa065) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Breaking:** `GET /api/media` and `GET /api/media/{id}` now require an
  authenticated actor, like every other route on that router. They never did,
  despite the file's own doc comment claiming otherwise since L2 — so an
  anonymous request returned every asset's id, filename, alt text, storage key
  and uploader.
  
  That gap became a real exfiltration path the moment L10 added a public
  `/_image?id=…` delivery endpoint: the ids that endpoint is keyed on are
  unguessable UUIDs, but they were *listable*, so every uploaded image —
  including the ones attached to nothing published — was downloadable without a
  session. Found by the security review of this lot.
  
  Any client reading the media library must now send its bearer token. The
  admin already did on every call.
  
  Two related fixes in the same area:
  
  - An uploaded image is stored with the content type its **bytes** earn, never
    the one the uploader declared. Sniffing already decided whether the file is
    an image; repeating the declared type afterwards let a genuine PNG announced
    as `text/html` be served as a document on the site's own origin, publicly
    and cached for a year. `/_image` also whitelists the type it puts on the
    wire, so an asset stored before this fix serves as an opaque download rather
    than executing.
  - `cogenta serve` no longer marks a page rendered for a signed-in actor as
    cacheable by a shared cache. A page render is per-actor — an editor sees the
    draft at the same URL — and `public, s-maxage=…` is precisely what RFC 9111
    §3.5 says re-authorises a CDN to store the answer to a request carrying
    `Authorization`. Anything sent with credentials is now `private, no-store`.
  - `/sitemap.xml` no longer 500s when the site has a routed collection the
    `public` role may not read: such a collection is skipped, since it has no
    public URLs to list.

### Minor Changes

- [`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Advanced AI (L18): a writing assistant, a `vector` driver, semantic search,
  RAG chat with citations, classification/duplicate detection/moderation, and
  FAQ/Schema.org drafting. **Nothing here is on a required path** — a site with
  no AI provider configured behaves exactly as before, and the whole feature set
  disappears from the UI rather than failing (R2).
  
  - **`@cogenta/agents`** gains the `vector` driver need the architecture
    document has named since L0 and nothing implemented: `VectorStore` with three
    drivers behind the existing `createDriverRegistry` — `pgvector` (optimal),
    `file` (degraded, survives a restart) and `memory` (degraded, always
    available). One contract suite runs against all three; pgvector's run is an
    integration test that skips loudly without `COGENTA_TEST_POSTGRES_URL`.
    Nothing re-implements cosine similarity: L4's `vectorRank` does the ranking
    everywhere, and all three drivers return the same number.
  
    `createSemanticSearch` fuses the vector half with L10's full-text index by
    RRF — **beside it, never instead of it**: pure vector search misses
    exact-keyword queries, which is the failure the architecture document warns
    about at line 190.
  
    Fifteen Contract C tools, all `sideEffects: false`, every output carrying
    `applied: false` as a **literal** so an assistant tool's type cannot say it
    changed anything (R6). Eight writing tools (rewrite, proofread, summarise,
    translate, meta description, titles, tags, alt text), `assist.generate_image`
    behind a two-vendor image provider driver (OpenAI, Stability), `assist.chat`
    (RAG with citations), `assist.classify`/`assist.find_duplicates`/
    `assist.moderate`, and `assist.faq_draft`/`assist.schema_org_draft`.
  
    Three properties worth knowing:
    - **Citations come from retrieval, not from the model.** The model names
      1-based indices into the passages it was shown; this code maps them back to
      what the retriever returned, and an invented index resolves to nothing. A
      chat answer can never cite a page that was not retrieved.
    - **Moderation and duplicate detection can recommend `none` or `review`, and
      nothing else.** The union has no destructive member, so no answer —
      however jailbroken — describes a deletion.
    - **`assist.find_duplicates` needs no AI provider at all.** It embeds with
      the site's `EmbeddingProvider`, which by default is the local hashing one:
      no key, no service, no model download.
  
  - **`@cogenta/core`** gains an `imageGeneration` config section
    (`COGENTA_IMAGE_PROVIDER`/`_MODEL`/`_BASE_URL`, key in `COGENTA_IMAGE_API_KEY`
    and refused in the config file like every other secret), a `vector` section
    (`driver`/`path`/`table` — dimensions stay on `embeddings`, never duplicated),
    and the error codes `VECTOR_DIMENSION_MISMATCH`, `VECTOR_STORE_FAILED`,
    `ASSIST_UNAVAILABLE`, `ASSIST_RESPONSE_INVALID`.
  
  - **`@cogenta/api`** gains `createAssistantRouter` — `GET /api/assistant` and
    `POST /api/assistant/run`. The `GET` answers **200 with
    `{available: false, tools: []}`** on a site with no provider, which is what
    lets a client render nothing instead of handling an error. The permission
    gate is the route's, not the tools' (R4): an actor may use the assistant when
    they may edit content somewhere, and an anonymous caller is refused before any
    provider is contacted, so an unauthenticated request can never spend the
    site's AI budget. The route also refuses any tool declaring a side effect,
    even though none does.
  
  - **`@cogenta/cli`** wires all of it into `cogenta serve`: providers built from
    the config, the vector store selected through the registry, the content stores
    wrapped so a publish updates the embedding index the same way it already
    updates the full-text one, and `/api/assistant` mounted on every site. Every
    piece degrades to "off" with a log line rather than stopping the site: an
    unknown provider name, a missing API key, an unavailable vector store and an
    embeddings provider with no adapter yet are four warnings, not four crashes.
  
  **Migration**: none. Every new configuration section is optional, and a site
  that adds none behaves exactly as it did before.

- [`ad18e0e`](https://github.com/cogenta-cms/cogenta/commit/ad18e0ed335d06ad861958e74bbfd2318e2509b8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Images are processed at upload and served with a real `srcset` (L10 task 5).
  `@cogenta/render`'s image pipeline, `srcset.ts` and its two driver tiers
  (sharp, WebAssembly libvips) had existed since L3 and were called by nothing:
  an uploaded image recorded no dimensions, produced no renditions, and
  `ctx.image()` in the rendered page threw `THEME_IMAGE_UNSUPPORTED`.
  
  - **`@cogenta/api`** — `createMediaRouter` takes an optional
    `MediaImageProcessor`. On an image upload it probes the intrinsic size into
    the asset's existing `width`/`height` columns (no schema change) and writes
    the renditions beside the original under `media/{id}/variants/`. Deleting
    the asset deletes them, by recomputing their names — `StorageDriver` has no
    `list`, which is why the ladder is fixed and `variantNames` exists. The
    interface is injected rather than imported: a REST transport has no business
    pulling a 12 MB WebAssembly dependency into its tree.
  - **`@cogenta/cli`** — builds that processor from the real driver registry and
    serves the renditions at a new **public** `GET /_image?id=…&w=…`. Public and
    image-only on purpose: a published page's `<img>` is fetched by a browser
    with no session, so it cannot sit behind the same gate as
    `/api/media/{id}/file`, which is unchanged and still covers every other kind.
    `/_image` never renders on demand — an unstored width falls back to the
    original — so a public URL cannot be turned into CPU.
  - The rendered page now carries a real `srcset`, and `og:image` and JSON-LD's
    `image` come from the same asset, absolute. Which media a page needs is
    answered by `collectDependencies`, the walk `/api/content` already uses,
    rather than by a new heuristic over block JSON.
  
  Variants are produced at upload rather than lazily because `cogenta serve`
  has no durable variant cache: a lazy pipeline behind an in-memory store
  re-decodes every image after every restart, which is the worst answer on the
  shared hosting R10 names. WebP only, for now, because AVIF's encode cost on
  the WASM tier — the tier that always exists — would make an upload of a
  handful of images take minutes.
  
  Also fixes a real shutdown hang: `server.close()` waits for every open
  connection, so one client that fetched a large response and never read the
  body kept `cogenta serve` alive forever. Shutdown now cuts remaining
  connections after a short grace period.

- [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Surface repeated failed sign-ins instead of only slowing them down (L14 task 4)
  
  `cogenta_login_attempts` has been written to on every failed sign-in since L2
  and read by nothing but the rate limiter's own counter. A site being
  brute-forced knew it and told nobody. It now says so, in two places.
  
  - `@cogenta/auth`'s `RateLimiter` gains `recentFailures()`, which groups the
    attempts still inside the backoff window by subject, worst first. It also
    **prunes** what has fallen out of the window — a real leak, since `clear()`
    only runs after a *successful* sign-in, so a subject that never succeeds
    accumulated rows for ever, which is exactly the case that grows fastest.
  - `@cogenta/api` gains `createSuspiciousActivitySource`, one more `NoticeSource`
    in the array `serve.ts` already builds. It shows an admin — and only an
    admin — how many failures across how many accounts, and is not dismissible
    because it disappears on its own within the limiter's fifteen-minute window.
  - `cogenta serve` also sends a `security.suspicious_activity` alert through the
    signed webhook channel L14 task 1 connected, built with `@cogenta/channels`'s
    own `buildAlert` — no second notification path and no second signature. At
    most one alert per five minutes, so a script making hundreds of attempts does
    not become hundreds of outbound requests.
  
  **Counts only, never the accounts.** Neither the notice nor the outbound alert
  names an email: that would turn an admin screen into an account-enumeration
  surface, and the numbers are what a decision is made on. Per-subject detail
  stays in the audit log, behind its own permission.
  
  The rate limiter itself was audited before anything was added and needed
  nothing: password sign-in, TOTP sign-in and TOTP enrolment all go through it,
  WebAuthn is deliberately exempt (there is no guessable secret), and password
  reset has no HTTP route at all.

- [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - MFA is no longer a gate at sign-in, and the admin gains a generic notices
  mechanism that recommends it instead (ADR-0021).
  
  **Breaking for anyone driving the auth API directly**, although both packages are
  still pre-1.0 and this is released as a minor:
  
  - `LoginResult` has two members, not three. `totp_setup_required` is gone.
    `passwordLogin` now issues a session for any role that has no second factor
    enrolled — including `admin` — and challenges only an account that actually
    enrolled one. Previously a role that could `publish` on any collection, and
    `admin` unconditionally, was refused a session until it completed a TOTP
    ceremony, which meant the first admin of a brand-new site could not reach a
    single screen without an authenticator app to hand.
  - An unconfirmed TOTP secret no longer counts as a factor. Someone who opened
    the enrolment screen and walked away used to be challenged for a code their
    authenticator app had never received, with no way back.
  - `AuthService.beginTotpSetup(ticket)` / `confirmTotpSetup(ticket, code)` are
    replaced by `beginTotpEnrolment(userId)`, `confirmTotpEnrolment(userId, code)`
    and `disableTotp(userId)`. Enrolment is self-service from an existing session
    rather than a step in the sign-in flow.
  - `POST /api/auth/totp-setup` and `POST /api/auth/totp-setup-confirm` are
    replaced by `POST /api/auth/totp/enrol`, `POST /api/auth/totp/enrol/confirm`
    and `DELETE /api/auth/totp`. All three require a session, and the account they
    touch is the one the bearer token resolves to — no route takes a user id, so
    no request shape can enrol or disable a factor on somebody else's account.
  
  `requiresMfa()` and `sensitiveRoles()` are unchanged and still exported. They now
  answer "who is shown the recommendation" instead of "who is blocked".
  
  New in `@cogenta/api`: `createNoticeRouter`, `createNoticeDismissalStore` and
  `createMfaRecommendationSource` — a generic admin-notice mechanism serving
  `GET /api/notices` and `POST /api/notices/{id}/dismiss`. Notices are per-account,
  persist until the thing they report is fixed or the person dismisses them, and
  carry a stable code plus substitutions rather than prose, so the admin translates
  them. A dismissal is stored server-side (new table `cogenta_notice_dismissals`,
  created on startup), so the answer follows an account across browsers instead of
  living in one `localStorage`. Adding a future recommendation is one more
  `NoticeSource` in an array, with no change to the router, the store or the admin.
  
  `cogenta serve` mounts `/api/notices` and registers the MFA recommendation.

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

- [`07e49bf`](https://github.com/cogenta-cms/cogenta/commit/07e49bf0d45260fc14c74efe8a67b2671fd8e022) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Document-driven site planning on a site that is already running (L19 tasks 5
  and 7). `@cogenta/api` gains `createSitePlanRouter` and `cogenta serve` mounts
  it at `/api/site-plans`; the admin gets a screen on top of it.
  
  Upload a brief, read what the agent understood, and decide on it one item at a
  time — every collection, page, demonstration entry and constraint read out of
  the document is its own yes or no. The API has no `acceptAll` parameter and the
  screen has no control that decides more than one item; `apply` calls
  `resolveApprovedPlan`, which refuses a plan with an undecided item, so there is
  no path that skips the review even for a caller writing raw HTTP.
  
  Applying is **additive**. A proposed collection whose name the site already
  uses is refused and reported — replacing a live collection is a migration with
  a diff and a backup, not a side effect of accepting a suggestion. What is
  applied writes the schema file, creates the new tables and seeds approved
  demonstration entries as drafts, never published. The report says plainly that
  `cogenta serve` has to be restarted to see the new collections, rather than
  implying the change is already live. A plan is applied at most once.
  
  Every route is admin-only. On a site with no LLM provider the routes that need
  a model answer `SITE_PLAN_NO_PROVIDER` (501) with a hint, and the list route
  reports `plannerAvailable: false` so the screen can explain itself — a plan
  proposed during installation is still readable and appliable there, which is
  what makes the installer's "save it for later" path mean something (R2).

- [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Breaking: `DELETE /api/content/{collection}/{id}` now means "move to the
  trash"**, not "destroy" (`schema@2.0`, ADR-0022). Two routes complete it:
  
  - `POST /{collection}/{id}/untrash` — take it back out;
  - `POST /{collection}/{id}/purge` — destroy it for good.
  
  Purge is a POST on its own path rather than a second meaning for `DELETE`,
  because two verbs on one path with two very different consequences is how
  someone destroys content by reflex. A client that used `DELETE` to really
  remove an entry must now follow it with `/purge`.
  
  `?trashed=include|only` on a list opens the trash; without it a pre-2.0 client
  sees exactly what it saw before. All four operations — including *seeing* the
  trash — require the `delete` permission on the collection: contract A freezes
  the five actions, so the trash borrows the one that fills it.
  
  Serialised entries gain `deletedAt`, orthogonal to `status`: an entry in the
  trash still reports the status it had, which is what restoring gives back.
  
  ### Taxonomy terms over HTTP
  
  `createTaxonomyRouter` mounts `/api/taxonomies`:
  
  ```
  GET    /{taxonomy}            the tree, in tree order
  POST   /{taxonomy}            create a term
  GET    /{taxonomy}/{id}       one term
  PATCH  /{taxonomy}/{id}       rename, relabel, reorder
  DELETE /{taxonomy}/{id}       delete (?cascade=true for the whole branch)
  POST   /{taxonomy}/{id}/move  re-parent it
  ```
  
  Mounted apart from `/api/content` because a taxonomy is not a collection and a
  site may legitimately name both the same thing. The materialised path is
  deliberately **not** serialised — it is a storage decision, and `parent` plus
  `depth` are what a tree renderer needs.
  
  `PermissionLayer` gains `canTerm`/`assertTerm` rather than a widened `can`:
  same role rules, no preview path. A preview token names a collection and an
  entry, so with a `category` collection beside a `category` taxonomy, sharing
  the code path would let a token minted for one unlock the other. Custom
  `PermissionLayer` implementations must add the two methods.
  
  ### In `cogenta serve`
  
  A project declares its taxonomies as a named `taxonomies` export beside the
  default one in `cogenta.schema.*`; a schema file written before 2.0 keeps
  loading unchanged and declares none. The server creates the terms tables before
  the collections, mounts `/api/taxonomies`, and passes `siblings` to every
  content store so `restrict` is still enforced when an entry is trashed.

- [`89ec072`](https://github.com/cogenta-cms/cogenta/commit/89ec0724be1dcc50b8fa5f7a14ca026c40e0de89) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Account management moves out of the terminal: `@cogenta/api` gains
  `createUsersRouter`, mounted by `cogenta serve` at `/api/users`.
  
  Until now `cogenta users create` was the only way to make an account. The new
  routes are:
  
  - `GET /api/users` (admin) — every account, optionally filtered by `?role=`,
    each with a summary of the second factors it holds
  - `POST /api/users` (admin) — creates the account and returns a server-generated
    password exactly once, the same rule the CLI already follows. The admin never
    chooses it.
  - `PATCH /api/users/{id}` (admin) — roles and status. Disabling an account
    revokes its live sessions in the same move.
  - `GET /api/users/{id|me}` and `GET /api/users/{id|me}/sessions` — yours, or
    anyone's with `admin`
  - `DELETE /api/users/{id|me}/sessions/{sessionId}` — revoke one session
  - `POST /api/users/me/password` — change your own password, current one
    required, rate-limited on the same store as sign-in
  
  Two deliberate absences. There is no delete: accounts are disabled, never
  removed, because an account that wrote content still has to be nameable in the
  audit log. And there is no route for an admin to set somebody else's password —
  that is a reset, it needs a delivery channel and a single-use token to be
  anything but a back door, and it is L13's task.
  
  Two safety properties worth naming, both covered by tests:
  
  - The last active `admin` cannot be demoted or disabled. Not a permission
    question — the person doing it is allowed to — but with no password reset yet
    there is no way back into a site with no administrator.
  - `DELETE /api/users/me/sessions/{id}` checks the session actually belongs to
    the caller before revoking it, so passing someone else's session id under
    `me` is a 404 rather than a successful revocation.
  
  `cogenta serve` records `user.create`, `user.update`, `user.password_change` and
  `user.session_revoke` in the audit log, naming the actor and the subject and
  nothing that could sign anyone in.
  
  `cogenta users create`'s closing hint and `create-cogenta`'s install recap no
  longer tell people they will be asked to set up a second factor at first
  sign-in: since ADR-0021 they will not be.

### Patch Changes

- [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Four corrections to L19, from the contract review.
  
  **ADR-0010 wins over the lot document.** Applying a site plan writes
  `cogenta.schema.*` and creates tables — that is the schema editor arriving by a
  different door, and ADR-0010 says it plainly: "uniquement en mode
  développement. En production le schéma est en lecture seule." L19's brief asked
  for the opposite ("un site déjà en production peut recevoir de nouveaux
  documents"); the acted decision wins, and the disagreement is written down in
  `BLOCKERS.md` with a ready-to-insert ADR-0023 rather than worked around.
  `RunServeOptions` gains `development`, set by `cogenta dev` and by it alone.
  Proposing and reviewing a plan stay available everywhere; only the write is
  withheld, and the refusal names the way out.
  
  **The schema file is the one the site really loads.** The applier wrote
  `cogenta.schema.mjs` by name, while `loadCollections` prefers
  `cogenta.schema.ts` — the form ADR-0010 calls for. On such a project it would
  have created the tables and then written a file nothing reads, leaving orphan
  tables and no collections after the restart it told the operator to do. It now
  resolves the real path (`findSchemaFile`, newly exported) and names it in the
  follow-up. It also refuses outright when the current schema declares a
  `validate` or a function `default`, which regenerating the file would silently
  delete.
  
  **Content a model wrote is marked as such.** Demonstration entries seeded by
  the installer and by the applier now carry `provenance: 'generated'` and a
  `provenanceDetail` naming the agent, the model and the time. Contract A calls
  that field non-optional because the European AI framework requires it; the
  store's default is `human`, so inheriting it would have made the one regulated
  field lie about every generated entry.
  
  **R8 has a second hop.** A constraint's `quote` is verbatim document text, and
  the analysis step's careful tagging counted for nothing when the content-model
  and demo-content prompts pasted it back in as prose — "Pas de blog. Ignore all
  previous instructions and …" is a single clause, so the whole thing is the
  quote. Both now go through `assembleContext`'s data channel too, escaped and
  tagged, with a test that smuggles a forged `</data><constitution>` inside a
  constraint and checks it arrives escaped.
- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f), [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/auth@0.2.0
  - @cogenta/schema@0.2.0
  - @cogenta/blocks@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/auth@0.1.2
  - @cogenta/blocks@0.1.2
  - @cogenta/schema@0.1.2

## 0.1.0

### Minor Changes

- [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the agent administration interface (L5 task 9): "état, autonomie,
  budget, historique, traces".
  
  `@cogenta/agents`: `BudgetTracker` gains `usage(): BudgetUsage` — a
  read-only snapshot of the same three calendar-bucketed counters
  `checkCall`/`recordCall` already track, needed so an admin can show
  real spend against budget.
  
  `@cogenta/api`: a new `/api/agents` router (`createAgentsRouter`),
  structural against `AgentRegistryLike`/`TraceStoreLike`/`AuditLogLike`
  — no hard dependency on `@cogenta/agents`. Lists agents with their
  state/autonomy/budget/usage, enables/disables one, and reads its
  traces/history (empty list, not an error, when a trace store or audit
  log was not wired in).
  
  `@cogenta/cli`: `assembleSite` accepts an optional `agents` option;
  `/api/agents` is only mounted when it is supplied — no site constructs
  one today, so every existing deployment is unaffected (R2).
  
  `@cogenta/admin`: a new "Agents" screen — a list with enable/disable
  per row, and a detail panel showing recent traces and history for the
  selected agent.

- [`5d64afd`](https://github.com/cogenta-cms/cogenta/commit/5d64afdb47dd5bfdbe06cb7895391b726fb22277) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `GET /api/audit` (filterable by `actorId`/`action`/`collection`/`since`,
  paginated by `limit`) and `GET /api/audit/verify` (recomputes the hash
  chain, `AUDIT_CHAIN_BROKEN` naming the first mismatch on tampering) — both
  restricted to the `admin` role.
  
  `@cogenta/auth`'s hash-chained audit log (`createAuditLog`) existed since it
  was built as generic core infrastructure, but nothing wrote to it and no
  route read from it. `cogenta serve` is now its first writer: every
  successful login, logout, content create/update/delete/publish/restore and
  media upload/update/delete records an entry, at the transport layer rather
  than inside each service — one place, so no future write path has to
  remember to call it separately. Recording never blocks or fails the
  response it is auditing.

- [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add passkey registration and passkey login (WebAuthn), completing L2 task 3's second
  factor: TOTP with self-service enrolment, and now passkeys — the spec's primary sign-in
  method.
  
  `@cogenta/auth`'s `AuthService` gains four methods: `beginWebAuthnRegistration`/
  `completeWebAuthnRegistration` for adding a passkey to an already-signed-in account, and
  `beginWebAuthnLogin`/`completeWebAuthnLogin` for a usernameless sign-in — no account is
  named up front; the assertion's own credential id decides which one it is. The challenge
  each ceremony needs between its two requests rides in the same short-lived signed ticket
  the rest of this package already uses, extended with an optional `challenge` field and a
  nullable `userId` (unknown until login resolves it) — never a server-side store for
  something single-use that lives seconds. `AuthStoreOptions` gains `webauthn` (relying
  party config) and `issuer`, both previously accepted by `createAuthService` but silently
  dropped by the store-level factory.
  
  `@cogenta/api`'s `createAuthRouter` exposes this as
  `POST /api/auth/webauthn/{register|login}/{begin|complete}`. `cogenta serve` derives the
  relying party id and origin from `site.url` and the name from `site.name` — one more
  config field to keep, not a new one to add.
  
  `@cogenta/admin`'s login screen leads with "Se connecter avec une clé d'accès" over
  `@simplewebauthn/browser`'s `startAuthentication`, with password-then-TOTP as the
  fallback underneath. Passkey *registration* — adding one to an account — needs a
  settings surface that does not exist yet in the admin and is deferred to when that
  surface is built; the backend and API routes for it are already in place.

- [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/api`: the permission layer, preview tokens, REST and GraphQL.
  
  Both transports run on one permission layer, as the lot requires. The hardest rule —
  the `public` role never reaches a draft, on any route, in either transport, whatever the
  query says — is enforced structurally rather than by condition: `canReadUnpublished`
  strips `public` from the actor's roles before looking at anything, so even a collection
  misconfigured with `update: ['public']` cannot become draft access.
  
  A preview token is the single deliberate exception, and it is scoped to one entry. That
  scoping is not free: `canReadUnpublished` is only told which collection is being read, so
  a grant for entry A would otherwise unlock every draft in it. Every path that returns
  entries filters each one through `previewCovers` — the list, the paginated connection,
  reads by id, and relation expansion including the batching loader.
  
  REST is a router over normalised request and response objects, with no HTTP framework and
  no listening socket, so it is tested without a server. Filters use a fixed vocabulary and
  values are coerced from the declared field kind, because a text comparison would rank
  `"10"` below `"9"`. GraphQL derives its schema from the collections, prints the same
  object it executes, and batches relation reads through a thirty-line dataloader written
  here rather than taken as a dependency.

- [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add TOTP self-service enrolment, so a sensitive role with no second factor yet can set
  one up instead of being locked out.
  
  **Breaking within `@cogenta/auth`'s pre-1.0 `LoginResult`**: `passwordLogin` used to
  throw `AUTH_MFA_REQUIRED` for a role that needs MFA but has no factor configured. It now
  returns `{ status: 'totp_setup_required', ticket }` instead — the password was correct,
  and enrolling TOTP right now is the only thing standing between this attempt and a
  session. `AuthService` gains `beginTotpSetup(ticket)` (generates a secret and an
  `otpauth://` URI) and `confirmTotpSetup(ticket, code)` (verifies the code, confirms the
  secret, and signs the user in).
  
  The ticket a `totp_setup_required` result carries cannot be used to complete an ordinary
  `mfa_required` login, and vice versa: `purpose` is now folded into what the ticket's
  signature covers, not checked separately, so the two are a signature mismatch away from
  being interchangeable rather than a bug someone could introduce later.
  
  `@cogenta/api`'s `createAuthRouter` exposes this as `POST /api/auth/totp-setup` and
  `POST /api/auth/totp-setup-confirm`. `@cogenta/admin`'s login screen walks a
  `totp_setup_required` account through it — showing the secret to add to an
  authenticator app and confirming the first code — rather than showing a dead end.

- [`7a16841`](https://github.com/cogenta-cms/cogenta/commit/7a168415e2fce628d4a835eb778be396104a2590) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add preview links: `POST /{collection}/{id}/preview` mints a one-hour,
  one-entry `PreviewGrant` token and returns the entry's real page path/URL
  alongside it (`site.url` + the collection's routing pattern). Any read of
  that one entry — `GET /{collection}/{id}` or `GET /-/by-path` — now accepts
  `?preview=<token>` together with `?state=working` to unlock exactly that
  entry's draft for whoever holds the link, and nothing else; a token for one
  entry never covers another, and a request with no token behaves exactly as
  it did before this change.
  
  The token is verified lazily, only when a `preview` query parameter is
  actually present, so an ordinary request never needs
  `COGENTA_PREVIEW_SIGNING_KEY` to be set at all — only minting and consuming
  a preview link do.
  
  `cogenta serve` passes `site.url` through to the REST router so a minted
  link is a ready-to-open absolute URL, not just a token the caller has to
  build a path for by hand.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the GraphQL API, generated from the collections and served over the same permission
  layer as REST.
  
  The schema is derived, not written: each collection produces one type carrying its
  declared fields and every system field of contract A, a cursor connection, a filter
  input, a pair of mutation inputs, and the five mutations — create, update, delete,
  publish and restore. A field added to a collection appears in the SDL, in the filter and
  in the mutation inputs at once, exactly as it already appears in `.cogenta/types.d.ts`.
  `renderSdl()` prints the very schema that answers the queries, so the published SDL can
  never drift from the executable one.
  
  GraphQL is a transport here, not a second engine. Queries go through the same
  `PermissionLayer` and the same filter vocabulary as REST — equality, comparison, `in`,
  `contains`, `exists`, `and`, `or` — and there is deliberately no escape hatch: no raw
  `where`, no `state:` argument, no way to name a draft. The state an actor reads is
  derived from the permission layer, so the `public` role cannot reach an unpublished
  entry by identifier, by listing, by filtering on `status`, through an alias or through a
  relation. A preview token is honoured for the single entry it names, checked per entry
  on every path including the batched relation loader.
  
  Pagination is by cursor. The `endCursor` of a page is the position of the last entry
  actually handed out, so a page whose entries were filtered in memory still continues
  where it stopped, and concurrent insertions cannot make a reader see an entry twice.
  
  Relation expansion is bounded, with a low default of two hops, because relations can be
  circular; the `depth` argument may lower the bound but never raise it. Related entries
  are resolved through a small hand-written dataloader that batches by tick and
  de-duplicates, so a page of twenty articles by two authors costs two reads rather than
  twenty.
  
  Errors rendered to a client carry a stable code, a fixed message and a fixed hint, taken
  from a table keyed by the error code. No bound parameter, no identifier, no SQL and no
  stack can reach a GraphQL response; the full error goes to the logger instead. Parse and
  validation errors are the one exception and are returned verbatim, since they run before
  any variable is coerced and can only quote the document the caller just sent.
  
  New direct dependency: `graphql` (MIT, the reference implementation maintained by the
  GraphQL Foundation). Cogenta needs a spec-compliant parser, validator and executor;
  writing one would be thousands of lines of security-relevant code for no gain, and every
  GraphQL client tool expects the real thing. The dataloader, by contrast, is thirty lines
  and is written here rather than added as a second dependency.

- [`3bc0872`](https://github.com/cogenta-cms/cogenta/commit/3bc0872800001aace498f331abbd903c66f750e5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `/api/media` — upload, list, read, edit and delete media assets — over
  the `MediaStore` `@cogenta/core` shipped previously. `cogenta serve` now
  selects a storage driver (S3 or local, same registry the rest of the config
  already uses) and mounts the route alongside `/api/content` and `/api/auth`.
  
  Uploads travel as JSON with the file base64-encoded rather than multipart:
  the REST transport's own contract is "a body already parsed by the
  transport", and staying inside it avoids a multipart-parsing dependency for
  an admin-only upload path. The real file type is read from the bytes, never
  from the declared `Content-Type` or filename — the same check the image
  pipeline already used, moved into `@cogenta/core` in the previous release
  so this route can share it. An image whose bytes are not one of AVIF/WebP/
  JPEG/PNG is refused, naming what it actually is; an SVG upload is refused
  outright, per ADR-0017.
  
  Every route requires an authenticated actor — there is no per-collection
  permission model for media the way there is for content yet, so today's
  gate is "signed in at all," tightened once L4's agent tool permissions
  (contract C's `media.read`/`media.write`) land.

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

- [`aa878ea`](https://github.com/cogenta-cms/cogenta/commit/aa878ea6766361219fe218e17741ce1d9d9ffd2f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `cogenta serve` — a real HTTP server over `@cogenta/api` and `@cogenta/auth`, and
  the `/api/auth/*` REST routes (`login`, `totp`, `session`) those two now share through
  `@cogenta/api`'s new `createAuthRouter`.
  
  The actor a request authenticates as comes from one function, `resolveActor` — a bearer
  token resolved through `@cogenta/auth`'s sessions, never trusted further than that — and
  both `/api/content/*` and `/api/graphql` call it, so there is exactly one answer to "who
  is asking", not a REST answer and a GraphQL answer that could drift apart.
  
  Collections load from `cogenta.schema.ts` next to the config file, the same
  dynamic-import convention `migrate.ts` already used for migrations. `serve` refuses to
  start without `COGENTA_AUTH_SIGNING_KEY` rather than inventing one, since a signing key
  that changes on every restart would silently invalidate every in-flight MFA ticket.
  
  Passkey ceremonies and TOTP enrolment are not in this router yet — both need a challenge
  held between two requests, which is deliberately out of scope for this pass and tracked
  for L2 task 3.

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/schema@0.1.0
  - @cogenta/blocks@0.1.0
