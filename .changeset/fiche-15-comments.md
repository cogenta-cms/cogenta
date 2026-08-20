---
'@cogenta/comments': minor
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/theme-canonical': minor
'@cogenta/import': minor
'@cogenta/cli': minor
---

Fiche 15 — comments (ADR-0025, new contract F, `comments@1.0`):

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
