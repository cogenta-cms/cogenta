# @cogenta/core

## 0.5.0

### Minor Changes

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

- [`d0bfa1d`](https://github.com/cogenta-cms/cogenta/commit/d0bfa1d71166adfb0c66a296c4cf490ddd58a218) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/export`: content export/import (`export@1.0`, NDJSON, permission-aware),
  media archive export (streaming ZIP, references or full bytes), full-site backup and
  restore (`cogenta-backup@1.0`, engine-independent, checksummed, optionally encrypted
  with a passphrase), and GDPR/RGPD personal-data export by email — fiche 26.
  
  `@cogenta/core` gains nine error codes (`EXPORT_*`, `BACKUP_*`, `RESTORE_*`) and exports
  `MEDIA_TABLE`, its media table's physical name, so a caller assembling a full-site
  backup can name every table without depending on `@cogenta/core`'s internals.
  
  `@cogenta/cli` gains four new commands: `cogenta export`, `cogenta import content`,
  `cogenta backup create|list`, and `cogenta restore preview|apply`. Restoring a full
  backup is **CLI-only, by design** — it overwrites the database an admin session would
  be running against, so it is never exposed over HTTP; an admin instead applies a
  *content* export (additive, reversible through the trash).

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

## 0.4.0

### Minor Changes

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

- [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - API keys — machine-to-machine authentication, absent until now (L13 task 8).
  A script or integration had no way to authenticate against the REST/GraphQL
  API short of signing in as a human account and keeping its session alive.
  
  `@cogenta/core` gains four error codes: `API_KEY_INVALID`, `API_KEY_REVOKED`,
  `API_KEY_EXPIRED`, `API_KEY_NOT_FOUND`.
  
  `@cogenta/auth` gains `createApiKeyStore`, backed by a new
  `cogenta_api_keys` table that `ensureAuthTables` creates like the others. A
  key is `cogenta_sk_` followed by 256 bits of randomness, generated once,
  returned once, and never stored — only its SHA-256 hash is, looked up by
  that hash exactly the way `sessions.ts` looks up a session token. It is
  hashed fast rather than with scrypt on purpose: scrypt's cost defends a
  low-entropy, human-chosen secret against guessing, and a generated key has
  no such weakness to defend — the same reasoning that already applies to a
  session token.
  
  A key carries an explicit `scope`: an open set of role names, exactly like a
  user's `roles`, chosen once at creation and never derived from the account
  that minted it. `AuthStore` gains `apiKeys` alongside `users`/`sessions`.
  
  This changeset lands the store only. `@cogenta/api`'s `resolveActor` and the
  `/api/api-keys` admin router that mint and revoke keys land in a companion
  changeset for `@cogenta/api`/`@cogenta/cli`/`@cogenta/admin`.

- [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Completes the admin surface of contract E (ADR-0024) beyond its MVP: multiple
  variants per product, coupons, invoices and subscriptions are now all
  reachable from a real HTTP admin, not just the backend that already carried
  them.
  
  `@cogenta/commerce`'s `createCommerceAdminRouter` gains: `DELETE
  /variants/{id}` (a product's variant list was previously append-only from the
  admin's point of view); `GET`/`POST /coupons` and `POST
  /coupons/{code}/deactivate`; `GET`/`POST /subscriptions` and the
  `pause`/`resume`/`cancel` actions (absent when the caller does not wire a
  `SubscriptionStore` — a site with no `commerceSubscriptions` store answers
  404, never a crash); and `GET /orders/{id}/invoice` plus `GET
  /orders/{id}/invoice/pdf`, the read side of an invoice-issuing route that
  existed but could previously only be written to, never read back. The PDF
  route answers with a raw `Uint8Array` body — the one response in this router
  that is not JSON — and the Node transport (`cogenta serve`) now checks for
  that shape before deciding whether to `JSON.stringify` or stream bytes with
  `content-type: application/pdf`.
  
  `@cogenta/core` gains an optional `billing` config section (legal name,
  address, tax id, footer) — nothing here is a secret, rule R7 does not apply,
  a legal name is meant to be printed. Its absence is a real, first-class state:
  `cogenta serve` only builds an `InvoiceStore` and only accepts `POST
  /orders/{id}/invoice` once a site has filled this in, because an invoice with
  a made-up seller address is worse than no invoicing feature at all.
  
  `@cogenta/cli` wires `createSubscriptionStore` and the conditional
  `createInvoiceStore` into `assembleSite`, passes `coupons`/`subscriptions`/
  `invoices` into the admin router (previously only `catalog`/`orders`/
  `customers`/`payments` were threaded through, silently dropping the coupon
  store `cogenta serve` already built), and adds the PDF passthrough above.
  
  The admin (`@cogenta/admin`, private, no changeset) gets the screens this
  backend work makes possible: a real variant list per product (add, edit,
  remove, price and stock each independently, `commerce.catalog.write`-gated)
  replacing the one-variant-per-product MVP; `/commerce/coupons` (create by
  code/kind/value/validity window/redemption limit, deactivate); `/commerce/
  subscriptions` (list by status, cancel — creation is deliberately absent,
  since a subscription is created at checkout, not from the back office); and
  an "issue invoice" / download-PDF pair on the order detail screen. All money
  is entered and displayed through the existing `commerce/money.ts` conversion
  at the edges — every request on the wire still carries `priceMinor`, never a
  float.
  
  Proven end to end in `packages/cli/test/serve-commerce.test.ts`, against a
  real HTTP server and a real SQLite file: a second variant added and removed
  through the router; a coupon created, listed and deactivated, and refused for
  a role with only `commerce.read`; a paid order invoiced, the invoice read
  back by the same route the admin polls, and its PDF downloaded and checked
  for the format's own magic bytes (`%PDF-`) rather than merely a 200 status; a
  site with no `billing` configured answering `COMMERCE_INVOICE_NOT_FOUND`
  instead of issuing a document with a fabricated seller address; and a
  subscription seeded the way checkout would seed one, listed and cancelled
  through the real admin API.

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

## 0.3.0

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

- [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - E-commerce (L15), as a new package `@cogenta/commerce` on a **new contract E**
  rather than an extension of contract A.
  
  The decision is proposed in `ADR-DRAFT-commerce.md` at the repo root and is
  **not yet acted** — it needs a human to accept it before it goes into
  `docs/03-decisions.md`. The implementation assumes it. In one line: three of
  contract A's own decisions make an order a bad content entry. ADR-0014 would
  fork one order per language; ADR-0022 has just made every content entry
  restorable from the trash, and an order is not; and versioning drafts have no
  meaning for a sale. The product's *editorial* face stays firmly in contract A
  through an optional `contentRef`, so a catalogue keeps rich text, blocks, SEO,
  translations and scheduling for free. Contract A does not move: it stays at
  `schema@2.0`, and a site that sells nothing never creates a commerce table.
  
  **Money is an integer of minor units, everywhere.** The three mandatory
  dialects do not agree on decimals — SQLite has only `REAL`, a binary float — so
  a decimal column would mean something subtly different on one of the three
  supported databases. Rates are basis points for the same reason. Amounts are
  `bigint` columns, and every read goes through a decoder, because `pg` hands
  `int8` back as a *string*: a price read as `"1999"` and added to another is
  `"19991999"`, a bug that would appear only on Postgres and only in production.
  
  **Stock cannot go negative.** `takeStock` runs one immediate transaction and
  lowers each line with `update … set on_hand = on_hand - n where id = ? and
  on_hand >= n`, reading `rowsAffected` — the same idiom that makes a password
  reset token single use. Repeated variants in one basket are summed first, or
  two lines of two would each pass against a stock of three. The concurrency test
  is a real race against a SQLite *file* with two independent connections
  (`:memory:` gives two unrelated databases and would prove nothing), and it
  carries a control that re-implements the naive read-then-write and asserts it
  *does* oversell.
  
  **Placing an order is one transaction**: stock taken, coupon redemption
  claimed, order and lines written, cart closed, first history event recorded.
  Any failure and none of it happened.
  
  **Payment is interface plus two implementations**, like cache, queue and
  storage (R1). Stripe is `optimal`, written against the REST API with `fetch`
  and no `stripe` dependency, with real webhook signature verification
  (timing-safe, every `v1` candidate, 5-minute freshness window). Bank transfer
  is `degraded` and is **not a stub** — plenty of businesses are paid that way
  and nothing else; the difference is who confirms the money arrived. The whole
  checkout, the whole subscription biller and the whole invoice path are tested
  end to end with no API key, URL or network configured anywhere (R2).
  
  **Invoice numbers are gapless and never reused**, claimed by a compare-and-set
  inside the transaction that writes the invoice, so a rolled-back invoice does
  not burn a number and two invoices issued in the same millisecond get
  consecutive ones. A `count(*) + 1` would hand out duplicates under any
  concurrency and re-issue a number a deleted row used to hold. The PDF is
  generated with zero dependencies (R9/R10) and is deterministic: the same
  invoice regenerated years later is byte-identical, because it renders from a
  frozen snapshot and never reads a clock.
  
  Also: tax rules resolved by specificity rather than insertion order; shipping
  methods with an optional carrier driver that falls back to the stored rate when
  the courier's API is down; coupons with three kinds and a redemption count
  claimed the same way stock is; subscriptions whose month arithmetic puts 31
  January + 1 month on 28 February rather than 3 March, and which bill through
  the same orders, payments and invoices as everything else.
  
  `@cogenta/core` gains the `COMMERCE_*` error codes (a minor bump: adding a code
  is additive, and nothing existing changed meaning).
  
  **Not in this release**, and deliberately so: no admin React screens (the
  back office is a transport-free router with its own permission vocabulary,
  tested by role — the UI belongs with L11's design system), no storefront
  blocks, and no Stripe integration test against a real sandbox (it is written
  and skips loudly without `COGENTA_TEST_STRIPE_SECRET_KEY`).

- [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Document text extraction, as a contract C tool (L19 task 1). `@cogenta/agents`
  gains `document.extract_text` and the `extractDocumentText` function behind it:
  PDF, DOCX, Markdown and plain text in, plain text out. Format detection reads
  the bytes rather than the extension, since a brief emailed as `.pdf` is often
  really a `.docx`.
  
  No new dependency, on purpose (R9/R10). A `.docx` is a ZIP whose
  `word/document.xml` holds the body, and `node:zlib` already opens it — the
  ~120 lines of central-directory reading here replace a callback-era unzip
  library. The PDF reader walks content streams and their text-showing
  operators (`Tj`, `TJ`, `'`, `"`) instead of pulling in `pdf.js` through
  `pdf-parse`.
  
  It refuses rather than guesses, which is the part that matters downstream: a
  scan with no text layer is `DOCUMENT_NO_TEXT_LAYER`, an encrypted PDF says so,
  a legacy binary `.doc` is named as such, and — calibrated against real
  LaTeX-exported specifications — a PDF whose text layer is subset-font glyph
  indices is refused too, rather than passing mojibake on to an agent that would
  happily build a confident, entirely invented site plan from it. Footnotes and
  endnotes of a `.docx` are appended rather than dropped, and an embedded image
  produces a warning saying any requirement written inside it was not read.
  
  `@cogenta/core` gains the error codes this needs
  (`DOCUMENT_FORMAT_UNSUPPORTED`, `DOCUMENT_TOO_LARGE`,
  `DOCUMENT_EXTRACTION_FAILED`, `DOCUMENT_NO_TEXT_LAYER`) plus the ones L19's
  later tasks use.
  
  Contract C moves to `tools@1.1`: the permission taxonomy gains
  `document.extract`. No existing tool signature changes.

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

- [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Serve a site's own page for an unmatched URL (L14 task 2)
  
  `cogenta serve` answered every unmatched public URL with a bare JSON error.
  It now renders the site's own 404 page instead, with a real 404 status.
  
  The 404 body is an ordinary published entry at `site.notFoundPath` (`/404` by
  default, overridable in `cogenta.config` or via `COGENTA_SITE_NOT_FOUND_PATH`)
  — editable in the admin like any other page, and rendered by exactly the same
  function, through exactly the same permission-checked gateway, as every other
  page. So a draft 404 page is not shown to the public, and a site that has not
  written one still gets the plain refusal it got before. The lookup happens at
  most once per request: the 404 path itself is never re-resolved.

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

- [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06) Thanks [@georgesmomo](https://github.com/georgesmomo)! - CORS, security headers and a coherent cache-control on `cogenta serve`
  (L10 task 6).
  
  `@cogenta/core`'s configuration gains a `security` section:
  
  ```ts
  security: {
    cors: { origins: ['https://app.example.com'], credentials: false },
    csp: "default-src 'self'",
    hstsMaxAge: 31536000,
    pageMaxAge: 60,
  }
  ```
  
  Every field is off or permissive-by-omission by default, and that is a
  decision rather than timidity. CORS is off unless a site names an origin —
  the origin list *is* the switch, so "CORS is on" and "these origins may read
  it" cannot drift apart. HSTS is off unless asked and is never sent over plain
  HTTP: on a host that is not fully HTTPS it locks browsers out for `maxAge`
  seconds with no server-side undo, and it is the one header a wrong default can
  take a site offline with. Credentials together with the `*` origin is refused
  at startup, because every browser refuses that pair and a server that accepted
  it would look configured while granting nothing.
  
  `cogenta serve` applies all of it in one place, before any route runs, so a
  route added later cannot opt out by forgetting:
  
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` and
    `Referrer-Policy: strict-origin-when-cross-origin` on every response.
  - The configured CSP verbatim — a string, not a builder, because a CSP depends
    on which analytics, fonts and embeds a site actually uses.
  - CORS with an echoed (never blindly reflected) origin and `Vary: Origin`,
    plus a real preflight answer.
  - Cache-control by path class: `no-store` for `/api/*` and for the admin,
    `public, max-age=0, s-maxage=<pageMaxAge>, must-revalidate` for a public
    page, and the long immutable value image variants already set for
    themselves.

### Patch Changes

- [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Closes four denial-of-service and permission-escalation gaps a security review found in L19's document-upload pipeline and site-plan review screen, all reachable from a single uploaded file or a proposed content model — no LLM provider required to trigger them.
  
  - `.docx` extraction (`packages/agents/src/documents/docx.ts`): the regex scanning `word/document.xml` for `<w:t>…</w:t>` runs backtracked quadratically on unclosed tags (measured 21.8 s for 400 KB). Replaced with a single linear `indexOf`-based scan, and `word/document.xml`/footnotes/endnotes are now capped at 8 MiB each (`zip.ts`'s `read()` gained a per-call `maxBytes`) instead of the shared 200 MiB decompression-bomb ceiling, since a highly repetitive XML payload can deflate at several hundred to one.
  - PDF stream collection (`packages/agents/src/documents/pdf.ts`): `collectStreams` used an unbounded `lastIndexOf` to find each stream's dictionary, which re-scans the entire prefix of the file for every stream found — a file that is mostly fake `stream`/`endstream` markers with no real PDF structure could cost minutes of CPU with no decompression involved. The search window is now bounded to 2 KiB behind each `stream` keyword, and the number of streams processed is capped at 10 000.
  - PDF text accumulation (`packages/agents/src/documents/pdf.ts`, `extract-text.ts`): `MAX_TEXT_CHARACTERS` was only enforced after every content stream had already been decoded and joined, so a PDF with many individually-small-enough, highly compressible streams could accumulate many times that budget in memory before truncation ever ran. The reader now stops pulling in further pages once the accumulated text already exceeds the cap, moved to a shared `limits.ts` so both `pdf.ts` and `extract-text.ts` read the same number.
  - Site plan review (`packages/agents/src/site-plan/content-model.ts`, `approval.ts`): a proposed content model's `permissions` is entirely the model's own choice, so a hallucinated or prompt-injected proposal granting `public` the `create`/`update`/`delete` actions would have let any anonymous visitor write to that collection once the plan was applied. `buildCollection` now refuses such a proposal outright (`CONTENT_MODEL_PROPOSAL_PERMISSIONS_UNSAFE`, fed back as the next attempt's correction like any other invalid proposal); separately, the human review screen (`summarisePlan`) now always shows a collection's proposed permissions and routing pattern, not only its fields and rationale, so a legitimate-but-surprising grant is visible before acceptance.
  - `cogenta serve` (`packages/cli/src/commands/serve.ts`): `readBody` had no byte limit, and the one route inviting multi-megabyte bodies by design (`/api/site-plans`) only checked the admin role after the body was fully buffered. `readBody` now caps every request body at 64 MiB, rejecting with a new `REQUEST_BODY_TOO_LARGE` error code (HTTP 413); `/api/site-plans` now checks the admin role before reading the body at all, so a non-admin caller — anonymous or not — is turned away before the server reads anything they sent.

## 0.2.0

### Minor Changes

- [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `THEME_IMAGE_UNSUPPORTED`, thrown by `cogenta serve`'s new theme-render
  fallback (`@cogenta/cli`) when a theme block asks for an image — no image
  pipeline is wired into that in-process fallback yet, so a theme gets a clear,
  typed refusal rather than a broken `<img>`.

### Patch Changes

- [`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `loadConfig` now auto-loads a `.env` file next to `cogenta.config.mjs`, using
  Node's own `process.loadEnvFile` (no new dependency, R9) — so a real secret
  like `COGENTA_AUTH_SIGNING_KEY` no longer has to be exported by hand in every
  shell before `cogenta serve` will start. Skipped whenever the resolved `env`
  is not really `process.env` (identity check, not `options.env === undefined`
  — real callers like the CLI's own `run()` resolve `options.env ?? process.env`
  once and thread that same object down explicitly, so `options.env` is
  "defined" even in a real, unconfigured shell; a test injecting its own
  synthetic map is still exempt, since that map is a different object).
  
  Found via the user's own real end-to-end test: `npx cogenta serve` refused to
  start with "COGENTA_AUTH_SIGNING_KEY is not set", and the only documented fix
  was a manual, shell-specific `export`/`$env:` command with no Windows/Mac/
  Linux guidance. `create-cogenta` now writes a real generated key into `.env`
  (see `create-cogenta`'s own changeset) — this is the half of the fix that
  makes `cogenta serve` actually read it back.

## 0.1.0

### Minor Changes

- [`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/cli` and its first command, `cogenta doctor`.
  
  `doctor` reports which driver is running for each need, **why that one**, and what it
  costs. The "why" is the point: the registry can fall back from Redis to the filesystem
  without anyone noticing, and an operator who cannot see that has a site that is slower
  than they think for a reason nothing told them. Skipped drivers are listed with their
  reason too.
  
  It also states out loud what would otherwise be discovered later — that a site with no
  LLM provider works apart from the agents, that SQLite is one machine with no vector
  index, and that signed media URLs will not survive a restart without
  `COGENTA_STORAGE_SIGNING_KEY`. An invalid configuration is reported as the offending
  fields rather than a stack trace, and exits non-zero so a deployment script notices.
  
  Core gains `loadConfig` and `findConfigFile`, which walk up from the working directory
  the way a package manager looks for a lockfile. A missing config file is not an error: a
  container configured entirely through `COGENTA_*` and `DATABASE_URL` is a legitimate way
  to run.

- [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add two error codes for L5's agent format and registry:
  `AGENT_DEFINITION_INVALID` (`defineAgent` given an empty name or
  identity document path) and `AGENT_UNKNOWN` (a registry operation named
  an agent that was never registered).

- [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add two error codes for L4's autonomy and approval layer:
  `TOOL_CALL_REJECTED` (a human rejected a tool call awaiting approval) and
  `APPROVAL_REQUEST_UNKNOWN` (deciding an approval request id that does not
  exist).

- [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the `blog` blueprint (L9 task 3): `post`/`category`/`tag`
  collections, real demo content seeded through `ContentStore`, the canonical
  theme's default skin (`theme.tokens.json`), and a recommended-agents hint
  (`.cogenta/recommended-agents.json`) — no live agent scheduler is wired,
  since none exists anywhere in this codebase yet (R2). `resolveBlueprint`
  now genuinely resolves `blog` as available; `blank`'s output is unchanged.
  
  Also fixes a bare `throw new Error(...)` in `resolveBlueprint`'s internal
  consistency check, replaced with a `CogentaError`.
  
  One new `@cogenta/core` error code: `BLUEPRINT_REGISTRY_CORRUPT`.

- [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Postgres and MySQL/MariaDB database drivers.
  
  Both run the same contract suite as SQLite, against real servers — the L0 exit criterion
  that the three databases pass one integration suite rather than three that resemble each
  other.
  
  `postgres` (postgres.js) and `mysql2` are optional peer dependencies loaded through a
  dynamic import, so a site on SQLite installs neither and the default install still has no
  runtime dependency. postgres.js was chosen over `pg` because it has no transitive
  dependencies at all. Neither package appears in the published type declarations: each
  driver describes the slice of client API it uses structurally.
  
  A transaction reserves a single connection for its whole duration. Issuing `BEGIN` on a
  pool would start the transaction on whichever connection happened to be free and run the
  following statements on others, silently outside it — a bug that only appears under
  concurrency, which is where it costs the most. Nested transactions become savepoints on
  both, matching SQLite.
  
  `database.poolSize` is configurable and defaults to 5: shared hosting allows very few
  connections, and exhausting them takes a site down rather than slowing it. MySQL is
  opened with UTC and `dateStrings`, so a row does not read back differently depending on
  where the process runs.

- [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels` (L6 task 1): the `ChannelAdapter` interface and
  `createChannelRegistry`, the foundation for the L6 lot ("Canaux" —
  Telegram, Slack, Discord, email, webhooks).
  
  A message is described abstractly — `AlertChannelMessage`,
  `ReportChannelMessage`, `NotificationChannelMessage` — matching the lot's
  three fixed formats exactly, so no business code ever writes
  platform-specific Markdown. `ChannelIdentity.linkedUserId` is `string |
  null`, representing an unlinked channel identity as a first-class state:
  the lot's central security rule ("une commande entrante s'exécute avec les
  permissions de l'humain identifié, jamais avec celles de l'agent")
  requires that state to exist even before a later task enforces it.
  `InboundCommand` always carries the `ChannelIdentity` it came from, so a
  command cannot be routed without knowing who — if anyone — sent it.
  
  `createChannelRegistry` mirrors `@cogenta/agents`'s `createProviderRegistry`:
  a site with zero channels configured works fine (R2's spirit), `get()` on
  an unconfigured name throws a typed `CogentaError` rather than returning
  `undefined`.
  
  Two new `@cogenta/core` error codes: `CHANNEL_UNKNOWN`, `CHANNEL_DUPLICATE`.

- [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the email channel adapter (L6 task 8) — outbound-only (the lot's task
  list names this adapter without "commandes entrantes", unlike Telegram's
  task 4), buttonless: an `Alert`'s two actions render as HMAC-signed,
  single-use links (`## Approbations depuis le canal`'s explicit guidance for
  channels without buttons) reusing L6 task 5's real signing primitive rather
  than a new one.
  
  R1-compliant `EmailTransport` interface with one real, tested,
  no-external-service implementation (`createFileEmailTransport`, writes each
  message to disk) — a real SMTP/HTTP-API transport is a deliberate,
  documented follow-up, not built in this pass; raw SMTP is a materially
  larger undertaking than Telegram's plain-HTTP Bot API and was judged
  disproportionate to this task's scope.
  
  Two new `@cogenta/core` error codes: `CHANNEL_EMAIL_TRANSPORT_ERROR`,
  `CHANNEL_EMAIL_INBOUND_UNSUPPORTED`.

- [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels`'s identity-linking mechanism (L6 task 2): a
  one-time code generated on the admin side, verified from a channel, tying
  a channel-side identity (`channelName`/`channelUserId`) to a real Cogenta
  user — the piece "## La règle de sécurité centrale" (`docs/lots/L6-canaux.md`)
  depends on.
  
  `createChannelLinkStore(db, now?)` — `generateCode`, `verifyCode`,
  `resolveIdentity`, `revoke`, `listLinkedChannels`, all real, persisted
  (SQLite/Postgres/MySQL via `ensureChannelTables`, following
  `@cogenta/auth`'s `ensureAuthTables` pattern — no separate migration file).
  
  Codes are 8 characters from a 32-symbol unambiguous alphabet (Crockford-style,
  `0`/`O`/`1`/`I`/`L` removed), 40 bits of entropy, single-use, a short
  default TTL (10 minutes, "valable quelques minutes" per the lot doc) —
  judged against brute-forcing one code within its TTL window, not against
  long-term-secret standards (session tokens remain 256 bits). Stored hashed,
  never plain, like a session token.
  
  `verifyCode` rejects every failure kind — nonexistent, expired,
  already-used, wrong channel — with the same uniform `CHANNEL_LINK_CODE_INVALID`
  error, so a caller cannot accidentally build a channel-facing reply that
  leaks which reason applied (an enumeration oracle against unlinked
  identities).
  
  One new `@cogenta/core` error code: `CHANNEL_LINK_CODE_INVALID`.

- [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels`'s inbound command routing (L6 task 3) — the
  payoff for tasks 1 and 2: "## La règle de sécurité centrale"
  (`docs/lots/L6-canaux.md`), **"Une commande entrante s'exécute avec les
  permissions de l'humain identifié, jamais avec celles de l'agent."**
  
  `authorizeInboundCommand(identity, requiredRoles, getUserRoles)` — the
  single security gate every inbound command passes through. An unlinked
  identity (`linkedUserId: null`) is refused with `shouldReply: false`,
  matching "Une identité de canal non liée à un compte est ignorée, sans
  réponse — répondre confirmerait l'existence du bot à un inconnu": a
  consuming adapter that just checks the flag gets that property for free.
  A linked-but-unauthorized user is refused with `shouldReply: true`
  (they're a known person and may be told so). An authorized result always
  carries the identity's real, verified `linkedUserId` — never anything
  read off the inbound payload itself.
  
  `createCommandRouter({getUserRoles})` — parses `/name args`, looks up a
  registered handler, and routes through `authorizeInboundCommand` before
  ever invoking it. The unlinked check happens before even checking whether
  the command is recognized, so an unlinked stranger gets silence for
  *any* input, not just for commands that exist — an "unknown command"
  reply would itself leak the bot's existence.
  
  `requiredRoles` reuses contract A's own open role-name-array convention
  (`CollectionDefinition.permissions`, `@cogenta/api`'s `PermissionLayer`)
  rather than a parallel permission-string system.
  
  One new `@cogenta/core` error code: `CHANNEL_COMMAND_DUPLICATE`.

- [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add real constructors for the lot's three fixed message levels (L6 task 6)
  — `buildAlert`/`buildReport`/`buildNotification` (`src/formats/`) — that
  validate the exact rules `## Formats de message` states in prose: an alert
  requires a title/context/expected-action and a real admin URL; a report
  requires at least one key figure and refuses to exceed an abstract
  480-character screen budget unless a `moreUrl` fallback is given; a
  notification must be a real, non-empty single line. `approvals/message.ts`
  now builds its alert through `buildAlert` instead of a hand-assembled
  literal, so it gets the same validation for free.
  
  Also hardens the Telegram adapter's report rendering with a real,
  last-resort truncation at Telegram's actual 4096-character `sendMessage`
  limit — the `moreUrl` footer is never the part that gets cut, since it's
  the reader's only way to the full detail.
  
  New `@cogenta/core` error code: `CHANNEL_MESSAGE_INVALID`.

- [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels`'s notification preferences and grouping (L6 task
  7) — per `(userId, channelName)`: opted-in event types, minimum severity,
  quiet hours, and a grouping mode (`immediate | hourly | daily`).
  
  A `NotificationDispatcher.notify()` filters against these preferences and
  either sends immediately or queues the notification; `flushDue()`
  collapses every due group into a single message (a `Report` via
  `buildReport` for more than one queued item, a `Notification` for
  exactly one) — this is what turns fifteen dependency-scan findings into
  one grouped message instead of fifteen separate ones
  ("## Préférences", `docs/lots/L6-canaux.md`).
  
  Quiet hours defer a non-critical notification until the window ends
  rather than dropping it; a `critical`-severity notification always
  bypasses quiet hours. Preferences persist via a new `cogenta_channel_preferences`
  table (`ensurePreferenceTables`), following the same `create table if
  not exists` pattern as `ensureChannelTables`.
  
  One new `@cogenta/core` error code: `CHANNEL_PREFERENCES_INVALID`.

- [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Slack channel adapter (L6 task 9) — the second real
  `ChannelAdapter`, wired to the same identity linking and inbound command
  routing Telegram (task 4) already proved.
  
  Zero-dependency: a small hand-typed client (`createSlackClient`) calls
  Slack's plain HTTPS/JSON Web API directly via `fetch`, same reasoning as
  the Telegram client. Socket Mode, not the Events API webhook — Slack's own
  real, officially-supported answer to "no public HTTPS endpoint," same
  reasoning as Telegram's long-polling choice (no plane of this project is
  deployed publicly yet). `createSlackSocketClient` opens a WebSocket via
  `apps.connections.open`, using Node's built-in `WebSocket` global (stable
  since this project's Node 22 minimum) — no new dependency needed for the
  transport either. A `disconnect` envelope triggers exactly one
  reconnect, mirroring Telegram's continuous poll loop.
  
  Rate limiting: Slack signals a 429 via an HTTP `Retry-After` header
  (unlike Telegram's JSON `retry_after` field) — read correctly and
  retried with the real value, never a guessed backoff.
  
  Message rendering (`renderSlackMessage`) turns the abstract
  `ChannelMessage` into Slack Block Kit blocks, entirely inside this
  adapter. A button's `action_id`/`value` is literally the command text it
  routes as — a Block Kit button press (`block_actions`) goes through the
  exact same `CommandRouter.route()` a typed message does, never a second,
  parallel authorization path. An unlinked identity's message is tried
  once as a linking code, exactly like Telegram; every other case stays
  silent.
  
  Capabilities declared honestly: `threads`/`attachments` are `false` —
  not built this pass, deferred rather than half-implemented.
  
  One new `@cogenta/core` error code: `CHANNEL_SLACK_API_ERROR`.

- [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Telegram channel adapter (L6 task 4) — "Telegram en premier,
  complet": the first live `ChannelAdapter`, wired to tasks 2/3's identity
  linking and inbound command routing.
  
  Zero-dependency: a small hand-typed client (`createTelegramClient`) calls
  Telegram's plain HTTPS/JSON Bot API directly via `fetch`, following this
  project's established precedent (`@cogenta/import`'s WXR parser,
  `@cogenta/mcp`'s JSON-RPC subset) of a small hand-rolled client over a new
  SDK dependency for a REST API this simple.
  
  Transport: long-polling (`getUpdates`), not a webhook — a webhook needs a
  real public HTTPS endpoint and Telegram's own signature verification, and
  no plane of this project is deployed publicly yet (L9 task 12's scoping).
  Polling works unchanged wherever `cogenta serve` already runs.
  
  Rate limiting: a 429 response is retried using Telegram's own
  `retry_after` value, never a guessed backoff — "Prévoir la file, le
  backoff et le regroupement dès le premier adaptateur."
  
  Message rendering (`renderTelegramMessage`) turns the abstract
  `ChannelMessage` (alert/report/notification) into MarkdownV2 text plus
  inline keyboard buttons, entirely inside this adapter — "on n'écrit pas
  de Markdown Telegram dans le code métier." A button's `callback_data` is
  literally the command text it routes as: a button press goes through the
  exact same `CommandRouter.route()` a typed command does, never a second,
  parallel authorization path. An unlinked identity's message is tried
  once as a linking code (confirmed on success, silent on any failure) —
  "Une identité de canal non liée à un compte est ignorée, sans réponse"
  still holds for everything else.
  
  One new `@cogenta/core` error code: `CHANNEL_TELEGRAM_API_ERROR`.

- [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the generic signed webhook channel (L6 task 11, the final task of the
  L6 lot) — the security primitive "## Pièges connus" names explicitly:
  "Les webhooks entrants sont une surface d'attaque. Vérification de
  signature obligatoire, fenêtre temporelle, protection contre le rejeu."
  
  `verifyIncomingWebhook` checks all three, mandatory: HMAC-SHA256
  signature authenticity (constant-time comparison, same construction as
  `approvals/signed-link.ts`), timestamp freshness against an injectable
  clock (default 5-minute window), and replay rejection via a bounded
  in-memory `WebhookReplayGuard` — a request failing any check is rejected
  with a distinguishable, typed `CogentaError` (unlike identity-linking's
  deliberately uniform code, there is no enumeration oracle here: a
  webhook secret is either configured correctly or it isn't, and
  distinguishing "bad signature" from "stale timestamp" from "already
  processed" is a legitimate operator need). `signOutgoingWebhook` is the
  matching outbound half `createWebhookAdapter`'s `send()` uses on every
  request — round-trip tested against the real verifier, not just each
  half in isolation.
  
  `createWebhookAdapter` is outbound-only: `capabilities.buttons` is
  `false` (no UI to click — actions render as real signed links, reusing
  the same primitive the email adapter, task 8, already consumes) and
  `capabilities.inbound` is `false` — real inbound command execution for
  an arbitrary third-party caller is a materially larger undertaking
  (a live HTTP route, per-integration identity decisions) than this
  task's actual deliverable, the signing/verification primitive itself,
  which is complete and exercised end-to-end. `verifyIdentity` is an
  honest refusal, matching the email adapter's precedent.
  
  Three new `@cogenta/core` error codes: `CHANNEL_WEBHOOK_SIGNATURE_INVALID`,
  `CHANNEL_WEBHOOK_EXPIRED`, `CHANNEL_WEBHOOK_REPLAY_DETECTED`, plus
  `CHANNEL_WEBHOOK_DELIVERY_FAILED` and `CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED`.
  
  L6 ("Canaux") is now complete — all 11 tasks done.

- [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the database layer: the dialect abstraction, the SQLite driver and their contract
  suite.
  
  Callers write `` sql`… ${value}` `` and never a placeholder: Postgres wants `$1` where
  MySQL and SQLite want `?`, and letting that reach a call site is the dialect leak the
  design warns about. The same layer quotes identifiers per dialect and adapts values —
  SQLite has no boolean and no date type, MySQL's `datetime` carries no time zone — so a
  caller never has to know which database is connected. Interpolated values are always
  bound; only `unsafeRaw`, named to say so, inserts text verbatim.
  
  The SQLite driver uses Node's built-in `node:sqlite`, so the default install compiles
  nothing and depends on nothing. `better-sqlite3` is deliberately avoided: it is native
  code, and rule R10 forbids that without a fallback because it breaks on ARM, musl and
  shared hosting — the deployments SQLite exists to serve. WAL mode, a busy timeout and
  foreign keys are on from the first connection, and nested transactions map onto
  savepoints so two functions that each want a transaction compose.

- [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the `HTTP_FETCH_DOMAIN_DENIED` error code, thrown by `@cogenta/agents`'
  `http.fetch` core tool when a requested URL's host is not on the calling
  agent's allowed domain list.

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

- [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the `database` job queue driver — the degraded tier that needs no Redis and no
  persistent worker.
  
  Jobs are claimed with `FOR UPDATE SKIP LOCKED` on Postgres, MySQL and MariaDB, and under
  the write lock on SQLite. Two different mechanisms, one guarantee, proven by one contract
  suite: L0's acceptance criterion is that two concurrent workers never process the same
  job, and it is asserted with real connections racing on a real database rather than a
  mock. A claim that loses an InnoDB deadlock retries, because both MySQL and Postgres
  document that as the remedy rather than a failure.
  
  A worker only claims jobs it has a handler for, so two workers with different handlers
  take their own work instead of locking jobs they would have to put back. A job whose
  worker dies is released when its lease expires. Failures retry with exponential backoff
  and stop at `maxAttempts`, recording why.
  
  Two dialect traps are now handled in the db layer rather than by callers: `LIMIT` renders
  as a literal, because MySQL prepared statements reject a placeholder there, and the SQLite
  driver serialises statements per file within a process — `node:sqlite` is synchronous, so
  a second connection issuing a write while the first holds a transaction deadlocks the
  event loop rather than waiting.

- [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add one error code for L5's evaluation harness: `EVAL_THRESHOLD_NOT_MET`
  (`assertEvalThreshold`'s suite mean score fell below the required
  minimum — the mechanism a `*.eval.test.ts` file uses to fail CI on a
  prompt or model regression).

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

- [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add typed errors and configuration loading.
  
  `CogentaError` carries a stable `code`, an actionable `hint` and opt-in structured
  `details`. It is the only error library code throws — a bare `throw new Error("…")`
  gives callers nothing to branch on and users nothing to act on.
  
  `defineConfig` types `cogenta.config.ts`; `resolveConfig` validates it and applies
  defaults, then environment overrides. Secrets (`llm.apiKey`, `storage.accessKeyId`,
  `storage.secretAccessKey`) are rejected in the config file and read from the
  environment only. Unknown keys are errors rather than silently ignored settings, an
  invalid configuration reports every offending field at once, and the database driver
  is inferred from the URL scheme when it is not named.

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

- [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the `bullmq` job queue driver — the optimal tier, on Redis — as the counterpart to the
  `database` driver. Both now run **one** contract suite, so a site that loses its Redis
  falls back without a line of calling code changing.
  
  `bullmq` stays an optional peer: it is loaded by dynamic import through `loadBullmqModule()`,
  which returns `null` when it is absent, and the API it exposes is described structurally so
  the published type declarations never reference it. A site on the database queue installs
  neither `bullmq` nor `ioredis`, and still typechecks.
  
  Jobs are fetched by hand rather than by a `Worker` loop, because `tick()` is the call both
  drivers answer to — cron drives it on shared hosting, and it has to mean the same thing on
  Redis. The atomic claim stays inside Redis, so the L0 acceptance criterion holds: four
  workers draining twenty-four jobs never process one twice. A job whose worker was killed is
  returned to the queue by bullmq's stalled checker, which manual fetching does not start on
  its own — the driver starts it.
  
  Two mappings are worth knowing. Cogenta priorities run high-first and bullmq's run low-first
  with `0` reserved, so priorities are mirrored onto a mid-range origin; and bullmq has no
  cancelled state, so a cancelled job is removed and recorded in a tombstone hash under the
  driver's own key prefix. Job ids carry the job name, because bullmq shards by queue.
  
  `available()` opens a connection and pings rather than trusting that a URL is configured, and
  `health()` never reports the URL — it routinely carries a password.

- [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the MCP client: `createMcpStdioClient` spawns a third-party MCP
  server as a child process and speaks the same stdio JSON-RPC protocol
  as the server side (task 17). `wrapMcpTool` turns a remote tool into an
  ordinary `ToolDefinition` — permissions, `sideEffects`, `reversible` and
  `cost` are declared by the integrator, never trusted from the remote
  server, so a wrapped remote tool passes through the exact same registry,
  manifest, audit and autonomy pipeline as an internal one.
  
  Two new `@cogenta/core` error codes: `MCP_CLIENT_REMOTE_ERROR` (the
  remote server answered with a JSON-RPC protocol error) and
  `MCP_CLIENT_TOOL_FAILED` (the remote tool itself reported `isError:
  true`).

- [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add one error code for L4's memory layer:
  `AGENT_APPROVAL_NOT_DECIDED` (converting a still-pending approval request
  into a memory record — only a decided one carries a learning signal).

- [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the structured logger.
  
  `createLogger` emits one JSON object per line — never free text — with a level, an ISO
  timestamp, a message and the caller's fields merged at the top level. Fields cannot
  overwrite the record structure. `child()` binds context that repeats on every record
  without touching its parent.
  
  Every record passes through redaction on the way out: by field name (`apiKey`,
  `secretAccessKey`, `authorization`), by value shape (provider key prefixes, private key
  blocks, JWTs) and inside connection strings, where only the password is replaced so the
  URL stays readable for debugging. Fields that merely look related — `tokens`,
  `tokensPerDay`, `cacheKey` — are left alone, because over-redacting makes logs useless.
  
  `Error` values are unpacked explicitly rather than left to `JSON.stringify`, which
  renders them as `{}`, and an unserialisable field drops the field rather than throwing
  in the caller's face.

- [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire Drizzle onto the database layer, on all three dialects.
  
  Every dialect goes through Drizzle's **proxy** driver rather than the driver Drizzle
  ships for it, so ORM traffic runs on the same connection as raw SQL — one pool, the same
  transaction pinning, the same typed errors, and the same rule that a parameter value
  never reaches an error message. On SQLite there was no choice anyway: `better-sqlite3` is
  forbidden by rule R10 and `node:sqlite` has no Drizzle driver.
  
  `SqlExecutor` grows three things the bridge needs and nothing else has to use: `dialect`
  moves down from `DatabaseHandle` so a transaction executor knows what it is talking to,
  `execute()` runs SQL that is already rendered for the dialect without encoding its values
  a second time, and `asArrays` returns rows as ordered values — a join selecting
  `users.id` and `posts.id` loses one of them in an object keyed by column name.
  
  `db.transaction()` on a proxy instance is not usable. Use `drizzleTransaction`, which
  runs the work inside a handle transaction and rebuilds the instance on its executor, so
  every statement lands on the pinned connection and rolls back with it.

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

- [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Performance agent: `queryCrux` measures Core Web Vitals via the
  Chrome UX Report API (real-user field data on the deployed site, no
  headless browser); `medianMetrics` combines several noisy samples
  before `compareToBudget` or `detectRegression` ever run
  (`detectRegression`'s default 15% threshold is deliberately generous,
  so normal field-data jitter never gets reported as a regression);
  `diagnosePerformanceRisks` flags only structurally-derivable causes
  (missing image dimensions, unoptimized images, too many third-party
  scripts) — it does not guess at causes it cannot back with data.
  `performanceAgent` ties it together with the lot's tool list
  (`http.fetch`/`content.read`/`channel.send`/`build.trigger` — no
  content-writing tools).
  
  One new `@cogenta/core` error code: `PERFORMANCE_CRUX_QUERY_FAILED`.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `runPlugin` (L7 task 6) now enforces the lot's own words in full: "un plugin
  qui dépasse son temps ou sa mémoire est tué et désactivé, avec alerte. Il ne
  peut pas faire tomber le CMS."
  
  - A worker failure is now classified (`IsolatedRunResult.reason`:
    `'timeout' | 'memory' | 'crash'`) — `'memory'` is detected from Node's
    real `resourceLimits` heap-violation error message, `'timeout'` from the
    existing kill switch, everything else is `'crash'`.
  - Only a `'timeout'` or `'memory'` violation disables the plugin — an
    ordinary thrown error never does. Disablement is real and persisted
    (`createPluginDisableStore`, `cogenta_plugin_disabled` table, mirroring
    `cogenta_plugin_grants`'s `ensurePluginTables` pattern). `runPlugin` now
    requires a `disableStore` and refuses (`PLUGIN_DISABLED`, a new
    `@cogenta/core` error code) to even spawn a worker for an already-disabled
    plugin — checked before every run, not just after a violation.
  - The "avec alerte" half is a structural callback (`onPluginDisabled`), not
    a hard dependency on `@cogenta/channels` or any specific transport —
    wiring a disablement to a real notification is an integration decision
    for whatever assembles a site.
  - Proven by real, worker-based tests: a genuine heap-exhaustion fixture
    trips the real `resourceLimits` ceiling and is classified `'memory'`; the
    host process is proven to survive and remain usable (a follow-up run
    succeeds immediately after either violation type); a disabled plugin's
    next run attempt is refused before a worker is spawned; a human can
    re-enable a disabled plugin.

- [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Adds L7 task 9: real signature verification for registry-sourced plugins,
  per "## Signature" (docs/lots/L7-extensibilite.md): "Une signature invalide
  bloque, sans possibilité de passer outre depuis l'interface."
  
  - `packages/plugins/src/signing/` — real Ed25519 signing/verification via
    `node:crypto` (no new dependency): `generateSigningKeyPair`, `signManifest`
    (signs a deterministic, sorted-key canonicalization of the manifest),
    `verifyManifestSignature`/`verifyPluginSignature` (verifies against any
    of a list of trusted public keys), `readSignatureFile` (a signature travels
    as a sibling `<manifest>.sig` file, never embedded in the manifest shape).
  - `TRUSTED_REGISTRY_PUBLIC_KEYS` starts empty — no real plugin registry
    exists yet (pre-alpha), so every `registry`-source plugin fails
    verification by default rather than trusting a placeholder key.
  - `loadPlugin` (L7 task 2) now calls `resolveSignatureStatus` for every
    resolution: a `registry`-source plugin with a missing or invalid signature
    is hard-refused (`PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID`)
    before any plugin code is imported — there is no parameter anywhere that
    lets a caller force past this. A `local`/`git`-source plugin is allowed
    unsigned ("mode développement") and now carries a real `devMode: true`
    flag on `ResolvedPlugin` (plus `signatureVerified: boolean`) for a future
    admin banner to render as the lot's "avertissement permanent."
  
  Two new `@cogenta/core` error codes: `PLUGIN_SIGNATURE_MISSING`,
  `PLUGIN_SIGNATURE_INVALID`.

- [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add one error code for L4's privacy layer: `PRIVACY_NO_DATA_LEAVES_VIOLATION`
  (a run configured with `privacyPolicy.enabled: true` tried to call a
  provider outside its declared local allowlist).

- [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add four error codes for L4's LLM provider adapters: `PROVIDER_UNKNOWN`,
  `PROVIDER_REQUEST_FAILED`, `PROVIDER_RESPONSE_INVALID`, `PROVIDER_RATE_LIMITED`.

- [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the `PROVIDER_TIMEOUT` error code, thrown by `@cogenta/agents`' execution
  loop when a model call does not respond within its configured `timeoutMs`.

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

- [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the migration engine: tracking table, apply, rollback and status.
  
  `down()` is a required method, not an optional one. AGENTS.md says migrations are always
  reversible, and a type that permits an irreversible migration turns that rule into a
  suggestion.
  
  A destructive migration refuses to run without **both** an explicit confirmation and a
  verified backup, and the refusal names what each one will do to existing data so the
  confirmation is informed rather than reflexive.
  
  An applied migration that changed is refused rather than re-run or ignored: two
  environments that ran different SQL under the same id differ in ways nothing records.
  `status()` reports the mismatch without throwing, so a diagnosis can still run.
  
  Migrations take an exclusive lock, so two deployments cannot migrate at once — the
  primary key does the work, and a lock left by a crashed process is taken over after
  fifteen minutes. Each migration runs in a transaction where the database has
  transactional DDL. **MySQL does not**, so a failed migration there may be half applied;
  the engine says so in the error instead of claiming a rollback that never happened.

- [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the storage driver interface, the `local` implementation and their contract suite.
  
  Object keys are validated against a whitelist of allowed characters per segment rather
  than a blacklist of dangerous ones — keys arrive from uploads, imports and plugins, and
  a blacklist loses to URL encoding, backslashes and Unicode look-alikes. Every operation
  validates, so a traversal attempt raises instead of quietly reporting "not found".
  
  The `local` driver keeps objects and their metadata in two parallel trees. Storing the
  metadata next to the object would make it addressable as an object itself: readable
  under a guessable key, overwritable through a forged one, and colliding with any key
  that happened to end in the sidecar suffix.
  
  Signed URLs are HMAC-signed and verified in constant time. Without
  `COGENTA_STORAGE_SIGNING_KEY` the driver generates a per-process key and says so through
  `health()`, rather than silently issuing URLs that stop working after a restart.
  
  `StorageDriver` also gains `head()`: the content type is supplied by the caller and
  cannot be recovered later, so an interface with no way to read it back would lose it.

- [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add three error codes for L4's reversibility layer:
  `RECEIPT_UNKNOWN` (reverting a receipt id that does not exist),
  `RECEIPT_ALREADY_REVERTED` (reverting a receipt a second time), and
  `RECEIPT_NOT_REVERTIBLE` (the matching tool has no `revert()` available in
  the current run).

- [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the S3 storage driver as the optimal tier, verified against MinIO.
  
  The AWS SDK is an optional peer loaded through a dynamic import: a site storing media on
  disk installs none of it, and the published type declarations do not reference it. A
  buffer goes through `PutObject`; a stream goes through multipart `Upload`, so a large
  video is never buffered in memory to be stored.
  
  `forcePathStyle` is set whenever a custom endpoint is configured. MinIO, R2 and most
  self-hosted gateways serve buckets as a path rather than a subdomain, and assuming
  virtual-host style breaks all of them with what looks like a DNS error.
  
  The contract suite also caught a parity break: an object stored with no declared content
  type reads back as `application/octet-stream` from S3 but was `undefined` from the local
  driver, which would have made the two impossible to substitute when serving media. Both
  now return the HTTP default.

- [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the `deps.scan` tool: SBOM → OSV.dev correlation (only versions
  genuinely installed and affected, matched by OSV's own query semantics)
  → EPSS lookup → exploitability assessment crossing CVSS and EPSS →
  imposed-format security report (what's affected / what an attacker
  could do / is the site exposed / what's proposed / what happens if
  nothing is done).
  
  Two new `@cogenta/core` error codes: `SECURITY_OSV_QUERY_FAILED` and
  `SECURITY_EPSS_QUERY_FAILED`.

- [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `deps.patch` (opens a pull request bumping one dependency to a fixed
  version — never modifies anything directly; `revert` closes the PR
  without merging) and `securityAgent`, the frozen `AgentDeclaration`
  tying `deps.scan`/`deps.patch` together with the lot's default autonomy
  (`deps.scan` autonomous, `deps.patch` proposed).
  
  One new `@cogenta/core` error code: `SECURITY_DEPENDENCY_NOT_FOUND`.

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

- [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add two error codes for L4's skills layer:
  `SKILL_UNKNOWN` (loading a skill name that was never installed) and
  `SKILL_DEFINITION_INVALID` (a `SKILL.md` has no frontmatter block, or is
  missing `name`/`version`/`description`).

- [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the driver system: interface, registry, selection and health reporting.
  
  `createDriverRegistry` holds the implementations of one infrastructure need and picks
  between them by two different rules. When the configuration **names** a driver, that
  driver is used and any failure is fatal — starting on the filesystem because Redis was
  down, and saying nothing, would be a silent downgrade of someone's site. When it names
  nothing (or `auto`), the first available driver wins in tier order, and failures fall
  through to the next one, so `npm create cogenta` produces a working site with nothing
  else installed.
  
  Every selection carries a `reason` and the list of what was `skipped` and why, so the
  admin and `cogenta doctor` can state "job queue: database (degraded), because Redis is
  absent". A driver whose availability probe throws counts as absent rather than crashing
  startup, and `dispose()` is idempotent because shutdown paths overlap.

- [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `auth.signingKey` to the resolved configuration, read from
  `COGENTA_AUTH_SIGNING_KEY` — the key `@cogenta/auth`'s login ticket needs, and a real
  secret rather than a config-file field (rule R7): there is no `auth` section in the input
  schema at all, so writing one in `cogenta.config.ts` is rejected as an unrecognised key,
  not merely a forbidden one.

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

- [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add two error codes for L4's sub-agent layer:
  `AGENT_SUBAGENT_UNKNOWN` (a declared sub-agent name is not in the agent
  set) and `AGENT_SUBAGENT_TOOLS_NOT_SUBSET` (a sub-agent declares a tool
  its parent was not granted).

- [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the cache drivers: `memory` and `file`, plus their single contract suite.
  
  `invalidateTags` is mandatory in every implementation, servers or not — content caching
  is only correct if publishing can drop every page that embedded the changed content, and
  bolting that on later would mean rewriting each driver.
  
  Values round-trip through serialisation in `memory` too, not just on disk, so a caller
  cannot mutate the cache by keeping the reference on one driver and not on another. Both
  drivers run the same contract file, which is what makes them substitutable rather than
  merely similar.
  
  The `file` driver hashes keys into filenames rather than escaping them, writes through a
  uniquely named temporary file and an atomic rename, and retries the rename on the EPERM
  and EBUSY that Windows returns when another handle holds the target. A corrupted entry
  reads as a miss: a cache that throws is worse than a cache that forgets.

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

- [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add five error codes for L4's tool registry: `TOOL_DEFINITION_INVALID`,
  `TOOL_DUPLICATE`, `TOOL_UNKNOWN`, `TOOL_INPUT_INVALID`, `TOOL_OUTPUT_INVALID`.

- [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package `@cogenta/import`: `cogenta import wordpress <file.xml>` (L9 task
  6). Imports a WordPress "Export All Content" WXR file — posts, pages,
  categories, tags, media (downloaded and re-stored through `MediaStore`/
  `StorageDriver`), authors (as real, credential-less users), approved comments,
  postmeta (carried as opaque `f.json()` `customFields`, contract A has no
  free-form field kind), Gutenberg blocks converted to the block vocabulary
  (`prose`/`mediaFigure`/`quote`/`gallery`/`embed`) where a mapping exists, and
  301 redirects from each entry's old permalink (`reason: 'import'`, the
  `@cogenta/schema` redirect store's own case for this). Every WXR reader is a
  zero-dependency, WXR-scoped XML tokenizer (`deps-auditor` rejected
  `fast-xml-parser`: a single-maintainer seven-package split published the same
  day, and a general parser's DTD support is an unnecessary XXE surface for a
  file of unknown provenance) — a document declaring `<!DOCTYPE ... ENTITY` is
  rejected outright.
  
  Nothing that cannot be converted is silently dropped: an unmappable Gutenberg
  block, a dead media URL, an author with no email, a trashed post — every one
  of them lands in the returned `ConversionReport` (`imported`/`skipped`/
  `unconvertedBlocks`/`warnings`), which `cogenta import wordpress` prints. The
  command exits `0` even with items reported as unconverted — a reported
  partial import is the intended outcome for a real-world export, not a
  failure — and only exits non-zero when the file cannot be read or parsed at
  all.
  
  Two new `@cogenta/core` error codes: `IMPORT_WXR_PARSE_FAILED`,
  `IMPORT_WXR_UNSAFE_DOCUMENT`.

- [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Redis cache driver, as the optimal tier.
  
  `@redis/client` is an **optional peer dependency**, loaded through a dynamic import. A
  site that does not want Redis never installs it, `pnpm install` stays free of runtime
  dependencies, and the registry simply falls through to the file driver when the package
  or the server is absent. The published type declarations do not reference it either: the
  driver describes the slice of the client API it uses structurally.
  
  Keys are namespaced, and `clear()` walks them with `SCAN` rather than `FLUSHDB` — the
  Redis instance may be serving other things, and a cache driver that wipes someone else's
  data is an incident, not a clear. Expiry is written as `PX` so Redis can reclaim memory
  on its own clock, but the authoritative check stays on read, which is what keeps this
  driver's behaviour identical to the others.

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/blocks`: the twelve-block semantic vocabulary of contract B.
  
  `defineBlock` declares a block manifest — `name`, `version`, `schema`, `runtime`,
  `fallback`, `a11y` — and compiles it into a Zod validator. The twelve blocks of
  `blocks@1.0` ship registered and ready: `hero`, `prose`, `mediaFigure`,
  `featureGrid`, `cta`, `gallery`, `quote`, `faq`, `stats`, `logos`,
  `collectionList` and `embed`.
  
  - `parseBlock` / `parseBlocks` validate on write and refuse anything
    presentational: HTML in a text field, an unrecognised `className`, a `style`
    value. The error names the block and the field.
  - `loadBlock` / `loadBlocks` migrate a block whose schema version has moved on,
    one version step at a time, and report `migrated` so the caller writes the
    result back. A block's `_key` survives the migration by construction.
  - Register your own steps on a `BlockMigrationRegistry`; a missing step is a
    refusal, never a silent partial migration.
  
  `@cogenta/core` gains the `BLOCK_UNKNOWN`, `BLOCK_INVALID`,
  `BLOCK_DEFINITION_INVALID` and `BLOCK_MIGRATION_FAILED` error codes.

### Patch Changes

- [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `cogenta migrate` — `status`, `up` and `down` — over the existing migration engine.
  
  `status` lists every migration with the date and duration of its run, and marks the ones
  that changed after they were applied here. That last case exits non-zero: two
  environments that ran different SQL under the same id is the worst state to debug, and a
  deployment script has to notice it rather than read it.
  
  Migrations are plain ESM files in a `migrations/` directory next to the configuration
  file, default-exporting an object with `up(tx)` and `down(tx)`. They are ordered by file
  name, the id defaults to the file name, and the checksum is a hash of the file itself —
  so a migration edited after it ran is detected without anyone maintaining a second
  number. A project with no `migrations/` directory has zero migrations, which is not an
  error: L0 ships no business schema at all.
  
  A destructive migration still needs `--confirm-destructive` **and** `--backup-verified`.
  The engine already refused without both; the CLI now makes the refusal actionable by
  naming each destructive migration and printing its declared impact, instead of asking
  the operator to go and read the files.
  
  Core fix, found by running the command from a subdirectory: a relative path in a config
  file is now resolved against **that file**, not against the shell's working directory.
  `cogenta migrate status` run from `src/` used to open an empty `./site.db` next to `src/`
  and report an already-migrated database as entirely pending. The same applies to
  `cache.path` and `storage.path`. Absolute paths, server URLs and `:memory:` are
  untouched, and configuration that comes from the environment alone is unaffected.

- [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Adds a complete Discord channel adapter (L6 task 10): outbound messages
  rendered as real embeds with button components, inbound message/interaction
  handling routed through the existing identity-linking and human-permission
  authorization gate (never a parallel path), a real Gateway WebSocket client
  with deterministic heartbeat scheduling, and 429 rate-limit handling using
  Discord's actual `retry_after` value. One new `@cogenta/core` error code:
  `CHANNEL_DISCORD_API_ERROR`.

- [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains site-side telemetry emission (`packages/fleet/src/agent/`) — the closed, honest shape of what a site is allowed to send to the control plane, per the lot's own "## Ce qui remonte, et ce qui ne remonte pas."
  
  - `TelemetryPayload` is a closed type: only the fields the lot doc names
    (`installedVersions`, `sbomFingerprint`, `openCves`, `coreWebVitalsAggregate`,
    `availability`, `backups`, `certificateExpiry`, `adminAccounts`,
    `aggregatedErrors`) exist on it — no `content`/`media`/`memory`/`logs`
    field is representable at all. `sbomFingerprint`, `openCves`,
    `coreWebVitalsAggregate` and `adminAccounts` are wired to real, existing
    data sources in this codebase (`@cogenta/agents-builtin`'s security/
    performance agents, `@cogenta/auth`'s real user/credential model); the
    rest are honest shape-only placeholders — no real backup mechanism,
    certificate-expiry check, uptime monitor, or error-aggregation sink
    exists anywhere yet, and this task does not fabricate one.
  - `assertNoForbiddenFields` is a real, defense-in-depth runtime scan for the
    same forbidden list, catching a leak past a loosely-typed call site that
    TypeScript alone wouldn't stop — the literal "vérification exhaustive de
    ce qui sort d'un site" security test the lot names.
  - `signTelemetryPayload`/`verifyTelemetrySignature` reuse `@cogenta/plugins`'
    generalized Ed25519 primitive (task 9/12) — the same one L8 task 1's
    pairing already uses — and refuse to sign a payload carrying a forbidden
    field at all, rather than catching it only closer to the network boundary.
  - `fingerprintSbom` hashes the real SBOM via the same canonical, sorted-key
    content-signing helper, with a real bug fixed during this task's own
    testing: `canonicalizeContent` sorts object keys but not array element
    order, so two functionally-identical SBOMs built from a `dependencies`
    record whose keys simply iterate in a different order would otherwise
    fingerprint differently — the entries are now sorted by name before
    canonicalizing.
  
  One new `@cogenta/core` error code: `FLEET_TELEMETRY_FORBIDDEN_FIELD`.

- [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The MySQL/MariaDB driver's `transaction()` now retries automatically (up to
  3 attempts) when InnoDB reports `ER_LOCK_DEADLOCK`. A deadlock victim is not
  an application bug — MySQL expects the losing transaction to restart from
  scratch — but until now the raw error propagated straight to the caller,
  so two concurrent writers touching the same rows (two agents publishing at
  once, not just @cogenta/schema's own ten-concurrent-insert test) could
  surface a hard failure instead of one of them transparently retrying.
  
  Found via CI: @cogenta/schema's cursor-pagination-under-concurrent-insert
  integration test was deterministically deadlocking on both the mysql and
  mariadb dialects (they share this same driver), not a flake — reproduced
  on two separate CI runs before the fix.

- [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L7 task 4: the real, capability-gated SDK a sandboxed plugin actually calls.
  A small starter set — `content.read`, `http.fetch:<domain>`,
  `storage.read:<prefix>`/`storage.write:<prefix>` — each backed by a real
  host-side handler (`packages/plugins/src/host/capabilities.ts`) reached
  through a real bidirectional RPC extension of task 3's message protocol
  (`sdk-call`/`sdk-result`/`sdk-error`).
  
  Every handler re-verifies the SPECIFIC request (the exact requested domain,
  the exact storage key) against the SPECIFIC granted capability parameter —
  never just "was this capability name granted at all." A plugin granted
  `http.fetch:api.example.com` cannot use its own SDK method to reach a
  different domain; a plugin granted `storage.write:plugins/<name>` cannot
  escape that prefix, including via `../` traversal.
  
  "Une méthode non accordée est absente de l'objet SDK, pas seulement
  refusée" (explicit acceptance criterion) is enforced structurally: the
  guest-side sandbox (`packages/plugins/src/guest/sandbox-entry.mjs`) only
  ever assigns a method key onto the `sdk` object for a capability actually
  present in the granted list — a non-granted method is a genuinely missing
  object key, not a present function that throws.
  
  One new `@cogenta/core` error code: `PLUGIN_CAPABILITY_REFUSED`.

- [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — AI skin generation with hard-refusal validation (L9 task
  7). When an LLM provider is configured with a valid key and a free-text site
  description is given, the `blog` blueprint's `theme.tokens.json` is generated
  from that description instead of copying the theme's default: the model is
  asked for contract D's token JSON only (never CSS), and every candidate is
  checked by `@cogenta/render`'s existing `validateSkin` — reused wholesale,
  not reimplemented — in hard-refusal mode (AA contrast on every pair, a
  strictly monotone type scale, the full closed token set, `motion.reduced`).
  On a rejection, the thrown `CogentaError`'s `message`/`hint` become the next
  attempt's correction prompt, for three attempts. A successful candidate is
  rendered on three real preview pages (through the same generic
  `renderPage`/`renderBlock` pipeline a live site uses) written to
  `.cogenta/skin-preview/`, and the installer offers accept, regenerate, or
  fall back to the default — bounded so a non-interactive `--yes`/`--config`
  run never loops. Every outcome — generated and accepted, regenerated,
  fallen back after failed validation, or never offered — is reported by name
  in the install recap; nothing is silent.
  
  Scoped to the `blog` blueprint only, the one blueprint that writes a
  `theme.tokens.json` today. Regenerating a skin after install (`cogenta skin
  generate`) is explicit CLI surface the lot doc lists under a later task (L9
  task 9) and is not built here.
  
  One new `@cogenta/core` error code: `SKIN_GENERATION_RESPONSE_NOT_JSON`, for
  a model response that is not a single JSON object.
