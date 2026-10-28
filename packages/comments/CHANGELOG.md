# @cogenta/comments

## 0.2.13

### Patch Changes

- Updated dependencies [[`888ad6c`](https://github.com/cogenta-cms/cogenta/commit/888ad6cb175db45f122b31b06257857ee870ea10), [`888ad6c`](https://github.com/cogenta-cms/cogenta/commit/888ad6cb175db45f122b31b06257857ee870ea10)]:
  - @cogenta/core@0.14.3

## 0.2.12

### Patch Changes

- Updated dependencies [[`8be2bbd`](https://github.com/cogenta-cms/cogenta/commit/8be2bbde2b335367f1dba1b35dbd640447d30214)]:
  - @cogenta/core@0.14.2

## 0.2.11

### Patch Changes

- Updated dependencies [[`8b366d5`](https://github.com/cogenta-cms/cogenta/commit/8b366d5ef7aaab8051a3c827616c432d58541ac7), [`5c2f75a`](https://github.com/cogenta-cms/cogenta/commit/5c2f75a43d934265a4a8d98a1667ef90f75ac668), [`8b366d5`](https://github.com/cogenta-cms/cogenta/commit/8b366d5ef7aaab8051a3c827616c432d58541ac7), [`8b366d5`](https://github.com/cogenta-cms/cogenta/commit/8b366d5ef7aaab8051a3c827616c432d58541ac7), [`8b366d5`](https://github.com/cogenta-cms/cogenta/commit/8b366d5ef7aaab8051a3c827616c432d58541ac7), [`5c2f75a`](https://github.com/cogenta-cms/cogenta/commit/5c2f75a43d934265a4a8d98a1667ef90f75ac668), [`8b366d5`](https://github.com/cogenta-cms/cogenta/commit/8b366d5ef7aaab8051a3c827616c432d58541ac7)]:
  - @cogenta/core@0.14.1

## 0.2.10

### Patch Changes

- [#29](https://github.com/cogenta-cms/cogenta/pull/29) [`d1231ec`](https://github.com/cogenta-cms/cogenta/commit/d1231ecea97b3b472a78bef07931e32fedcde900) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Security review of 2026-10-21 — every finding fixed, each with a test that failed before the fix.
  
  - **Theme sandbox ran untrusted code in the server** (critical). Validating a sandbox write imported the file into the `cogenta serve` process, so a theme ZIP or a file written by the theme agent ran with the server's environment and database. Sandbox modules are now imported, previewed and checked only in a child process under Node's permission model (`--permission`, the sandbox and installed packages readable, empty environment): `@cogenta/plugins` gains `runIsolatedModule({ readPaths })`, `inspectIsolatedModule` and `moduleReadPaths`. A deploy also refuses sources using `process`, `globalThis`, dynamic `import()` and similar, and the admin says plainly that a deployed theme runs with the site's rights.
  - **Plugin sandbox escape**: a refused SDK call rejected with an error of the host realm, whose `constructor` reached the real `process` (and with it unrestricted `fetch`). Errors now cross as strings.
  - **Stored XSS through `javascript:` links**: contract B accepted `javascript:`, `vbscript:` and `data:` in call-to-action targets, rich-text links, `url`-format fields and logo links. They are refused on write (`isScriptUrl`, `@cogenta/blocks`) and neutralised on output for every theme and plugin tree (`safeUrlAttribute` in `@cogenta/theme-kit`'s `serialize`). The admin's theme previews are iframes with scripting disabled (`sandbox`).
  - **Sign-in brute force**: the attempt is now reserved before the password is checked (`RateLimiter.reserve`), closing a race that allowed ~1,000 guesses per window; failures are counted per account and address, the account alone only at ten times the threshold (no lockout of an owner by a stranger); an unknown address costs the same password check; the reset mail is sent without making the answer wait. Changing one's password signs out every other session.
  - **Open redirects**: `/_cogenta/unlock`'s `next`, prefix redirect rules (`/blog/*` → `/` asked for `/blog//evil.example`) and redirect rows (also written by the Site Monitor agent) can no longer point off-site.
  - **Denial of service**: about 70 regular expressions that backtracked quadratically (a URL of 16,000 slashes held the event loop for a second; a hostile e-mail in a public form or comment, longer) are rewritten in linear form; anonymous request bodies are capped at 1 MiB (a public form's file upload keeps its own ceiling); a PDF's total decompression is bounded; a password-protected page also has a per-page attempt ceiling.
  - **AI**: tool results reach the model as escaped DATA blocks (R8); a delegated agent never gets more autonomy than its delegator (`stricterAutonomy`); private and password-protected entries are no longer indexed for the assistant's chat; moving a provider's endpoint requires its API key again (`PROVIDER_KEY_REQUIRED`, a new error code), so a stolen session cannot send the saved key elsewhere; changes to agents, providers, skills, prompts and MCP connections are recorded in the audit log; a disabled account loses its rights on linked chat channels at once; linking and approval codes are drawn without modulo bias.
  - **Import**: a WordPress media download checks every redirect hop as a public address and stores the file under the type its bytes deserve.
- Updated dependencies [[`96b7dd8`](https://github.com/cogenta-cms/cogenta/commit/96b7dd84544b24b938ef812e3ee5bf892770241e), [`d1231ec`](https://github.com/cogenta-cms/cogenta/commit/d1231ecea97b3b472a78bef07931e32fedcde900)]:
  - @cogenta/core@0.14.0

## 0.2.9

### Patch Changes

- [#28](https://github.com/cogenta-cms/cogenta/pull/28) [`c082c31`](https://github.com/cogenta-cms/cogenta/commit/c082c31a106cd1c8ea3d4d7a7c7600a7e4d61aab) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Correct conditional public form visibility and native validation with a no-JavaScript fallback, preserve repeated multipart choice values, reject missing or stale comment timing, and mount payment webhooks with raw-body provider signature verification and idempotent settlement.
  
  Reject payment notifications with mismatched settlement amounts or currencies and prevent delayed deliveries from undoing paid or refunded states.
  
  Use the site's language for default form confirmation and acknowledgment messages, preserving author-written text.
- Updated dependencies [[`dcf76f4`](https://github.com/cogenta-cms/cogenta/commit/dcf76f4ef93be5bae52196a5a610df4f0a36dfba), [`ab0bf4f`](https://github.com/cogenta-cms/cogenta/commit/ab0bf4fe4d79d668e857ecc13cc882a80179e10b), [`c082c31`](https://github.com/cogenta-cms/cogenta/commit/c082c31a106cd1c8ea3d4d7a7c7600a7e4d61aab)]:
  - @cogenta/core@0.13.0

## 0.2.8

### Patch Changes

- Updated dependencies [`4747d81`, `2a34b50`]:
  - @cogenta/core@0.12.0

## 0.2.7

### Patch Changes

- Comments, public forms and search speak the site's language
  
  The comment section and its form were English on every site: `renderCommentsSection`
  now reads every word from `THEME_STRINGS` (French and English), writes dates in
  the page's language, accepts the page's own translator (`t`) and shows what
  became of a comment just sent (`notice`: published, awaiting review, or why it
  failed). `commentNoticeFor` reads that from the redirect; a comment held as spam
  reads as awaiting review, and a tripped honeypot only as a failure.
  
  `@cogenta/comments` sends a no-JavaScript submission back to `#cg-comments`,
  where the notice is. `cogenta serve` passes the notice and the page translator,
  and writes `/forms/{name}` and `/search` in the site's language: buttons, field
  errors, and refusals chosen by error code rather than the API's English message.
  Every theme styles the notice as it styles a form's message.

## 0.2.6

### Patch Changes

- Updated dependencies [`614f545`]:
  - @cogenta/core@0.11.0

## 0.2.5

### Patch Changes

- Updated dependencies [`166b71e`, [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0), `8153b2d`]:
  - @cogenta/core@0.10.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`8f0e946`](https://github.com/cogenta-cms/cogenta/commit/8f0e946573b8d8b31c89c956bb75d9a1eb6061a2), [`0e346da`](https://github.com/cogenta-cms/cogenta/commit/0e346da6204f91c0efa47066667e127c76c4ecde), [`d222023`](https://github.com/cogenta-cms/cogenta/commit/d222023000e4933c5c8cefe21bb1c64fafd34b67)]:
  - @cogenta/core@0.9.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`10db071`](https://github.com/cogenta-cms/cogenta/commit/10db07162f24b56d750770480ebb2b5e2868773a), [`b0c8677`](https://github.com/cogenta-cms/cogenta/commit/b0c86775f2fe8d68bce3a5b248803911b57ed71f), `c9dffa4`, [`858aec8`](https://github.com/cogenta-cms/cogenta/commit/858aec8a332fe434975e34b6f9b2a1ec173b65cd)]:
  - @cogenta/core@0.8.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`89e7579`](https://github.com/cogenta-cms/cogenta/commit/89e7579129712a5978ff57b884151731f5c340ea)]:
  - @cogenta/core@0.7.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`b85ce4e`](https://github.com/cogenta-cms/cogenta/commit/b85ce4edad72ff065cd63c852a9f42aeefc5ab9a), [`bde02b5`](https://github.com/cogenta-cms/cogenta/commit/bde02b518f98a8d4cbc58544ea809c658b8dee7b)]:
  - @cogenta/core@0.6.0

## 0.2.0

### Minor Changes

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

### Patch Changes

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
