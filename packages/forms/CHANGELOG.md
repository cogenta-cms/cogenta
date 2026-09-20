# @cogenta/forms

## 0.2.15

### Patch Changes

- Updated dependencies [[`dcf76f4`](https://github.com/cogenta-cms/cogenta/commit/dcf76f4ef93be5bae52196a5a610df4f0a36dfba)]:
  - @cogenta/core@0.12.1
  - @cogenta/channels@0.3.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.14

## 0.2.13

### Patch Changes

- Updated dependencies [`4747d81`, `2a34b50`]:
  - @cogenta/core@0.12.0
  - @cogenta/channels@0.3.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.11

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.10

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.9

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.8

## 0.2.7

### Patch Changes

- Updated dependencies [`614f545`]:
  - @cogenta/core@0.11.0
  - @cogenta/channels@0.3.7

## 0.2.6

### Patch Changes

- Updated dependencies [`166b71e`, [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0), `8153b2d`]:
  - @cogenta/core@0.10.0
  - @cogenta/channels@0.3.6

## 0.2.5

### Patch Changes

- [`0e346da`](https://github.com/cogenta-cms/cogenta/commit/0e346da6204f91c0efa47066667e127c76c4ecde) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fixes for defects that only a real MySQL, MariaDB or Postgres — or two
  requests at once — ever exposed. The integration suites had not run against
  those engines for a long time; with them back, each of these surfaced as a
  production bug rather than a test problem.
  
  **MySQL and MariaDB**
  
  - `@cogenta/schema`: booleans were bound as the string `'true'` into columns
    `booleanColumn` builds as `tinyint`, which MySQL refuses. Maintenance mode
    and role permission overrides could not be saved there. A new
    `booleanValue(value, dialect)` sits beside `booleanColumn`.
  - `@cogenta/auth`, `@cogenta/analytics`, `@cogenta/forms`, `@cogenta/commerce`,
    `@cogenta/fleet`: `LIMIT` was bound as a statement parameter, which MySQL
    rejects ("Incorrect arguments to mysqld_stmt_execute"). Password resets,
    credential lookups, the audit log, analytics summaries, form submissions,
    order e-mails and fleet telemetry were affected. All now use `limit()`.
  - `@cogenta/core`: the media library's tag filter used `escape '\'`, an
    unterminated string on MySQL. The escape character is now `!`; nothing
    stored depends on it.
  - `@cogenta/analytics`: the daily-salt table declared a `text` primary key,
    which MySQL cannot index. It is `varchar` there now.
  
  **Postgres**
  
  - `@cogenta/schema`, `@cogenta/agents`: looking up a pattern or a reference
    document by an id that is not a uuid raised a database error (a 500) instead
    of answering "not found". A new `isMintedId` guards those lookups.
  - `@cogenta/schema`: the 404 log's upsert used an ambiguous `hits` column
    reference that Postgres refuses.
  - `@cogenta/schema`: `create table if not exists` is not atomic on Postgres, so
    two replicas starting the scheduler at once could crash on a catalogue
    collision. Tolerated for that collision only.
  - `@cogenta/core`: deleting a media folder swallowed an error inside its
    transaction, which Postgres treats as aborting the whole transaction.
  
  **Two requests at once**
  
  - `@cogenta/commerce` (**minor**): overlapping flushes of the order e-mail queue
    sent the same confirmation twice. Each message is now claimed before it is
    sent, through a new `'sending'` value of `OrderEmailStatus`. Code that
    switches exhaustively over that union must handle it. A process that dies
    mid-send leaves the row `sending`; it is not retried automatically.
  - `@cogenta/schema`: two writers racing the same role override, or the same
    brand-new 404 path, could throw. Both retry a lost race now, bounded.
  - `@cogenta/core`: two queue workers ticking together could deadlock on MySQL
    while reclaiming expired leases, and the error escaped the tick.
  - `@cogenta/agents`: agent records were written in place, so a concurrent read
    could parse half a file (a 500), and two changes to the same agent could
    silently undo each other — an agent just enabled came back disabled. Writes
    are now atomic and serialised per agent.
  - `@cogenta/cli`: the automatic update task could start a second install of the
    same versions while the first was still running.
  - `@cogenta/cli`: a schema file that existed but could not resolve one of its
    own imports was reported as "No schema file found". It now says what failed
    to load.
- Updated dependencies [[`8f0e946`](https://github.com/cogenta-cms/cogenta/commit/8f0e946573b8d8b31c89c956bb75d9a1eb6061a2), [`0e346da`](https://github.com/cogenta-cms/cogenta/commit/0e346da6204f91c0efa47066667e127c76c4ecde), [`d222023`](https://github.com/cogenta-cms/cogenta/commit/d222023000e4933c5c8cefe21bb1c64fafd34b67)]:
  - @cogenta/core@0.9.0
  - @cogenta/channels@0.3.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`10db071`](https://github.com/cogenta-cms/cogenta/commit/10db07162f24b56d750770480ebb2b5e2868773a), [`b0c8677`](https://github.com/cogenta-cms/cogenta/commit/b0c86775f2fe8d68bce3a5b248803911b57ed71f), `c9dffa4`, [`858aec8`](https://github.com/cogenta-cms/cogenta/commit/858aec8a332fe434975e34b6f9b2a1ec173b65cd)]:
  - @cogenta/core@0.8.0
  - @cogenta/channels@0.3.4

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @cogenta/channels@0.3.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`89e7579`](https://github.com/cogenta-cms/cogenta/commit/89e7579129712a5978ff57b884151731f5c340ea)]:
  - @cogenta/core@0.7.0
  - @cogenta/channels@0.3.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`b85ce4e`](https://github.com/cogenta-cms/cogenta/commit/b85ce4edad72ff065cd63c852a9f42aeefc5ab9a), [`bde02b5`](https://github.com/cogenta-cms/cogenta/commit/bde02b518f98a8d4cbc58544ea809c658b8dee7b)]:
  - @cogenta/core@0.6.0
  - @cogenta/channels@0.3.1

## 0.2.0

### Minor Changes

- db307e0: Add form definitions and submissions — contract G (`forms@1.0`, ADR-0026, fiche 16). A site can now build a form in the admin and receive real submissions, without JavaScript and without an AI provider.
  
  - New package **`@cogenta/forms`**: `FormDefinition`/`FormSubmission` model (nine field kinds — text, longText, email, phone, number, date, choiceSingle, choiceMulti, consent; no `file` field in this first version, a deliberate scope cut), `createFormStore` (definitions CRUD, `submit`/`list`/`markStatus`/`bulkMarkStatus`/`searchByEmail`/`deleteByEmail`/`purgeExpired`), full server-side `validateSubmission` (independent of any client-side check, for every field kind), anti-abuse primitives (`checkHoneypot`, `checkFillDelay`, `checkSubmitRateLimit`), and `notifyNewSubmission`/`sendAutoresponder` — both built on `@cogenta/channels`'s existing email adapter, never a second transport. `ensureFormsTables` follows the same `create table if not exists` shape as `@cogenta/commerce`'s tables — a site that never builds a form still creates them, since (unlike commerce) forms tables are cheap enough not to gate.
  - `@cogenta/core` gains eleven `FORM_*` error codes.
  - `@cogenta/api` gains `createFormsRouter` (`/api/forms/*`): admin-only CRUD on definitions and submissions (bulk mark/delete, unread count, CSV-ready listing, GDPR search/erase by e-mail), plus the CMS's **second public write route**, `POST /api/forms/{name}/submit` — no actor check, its own defences (honeypot, minimum fill delay, per-IP rate limit, full server-side validation) stand in for one. The client's IP is read from the resolved request context, never from a client-supplied `X-Forwarded-For` header — trusting that header would let an attacker rotate it per request and step around the rate limiter entirely. `ShellStatus` gains `formSubmissionsUnread` for the admin's nav badge (additive).
  - `@cogenta/cli` wires it all into `cogenta serve`: `GET /forms/{name}` is the public, no-JavaScript "route dédiée" ADR-0026 chose over a contract B block (a bloc `form` RFC is left open in parallel); a plain HTML form post is answered with a real redirect on success or an accessible re-display of the visitor's own values and per-field error (`aria-invalid`/`aria-describedby`) on failure; notifications reuse the same `FileEmailTransport` already built for account invitations; submissions past a form's own `retainDays` are purged automatically on a daily tick, the same `retainDays`/`purgeExpired` model ADR-0022 established for the trash.
  - Admin (`@cogenta/admin`, private, no changeset): `routes/forms.tsx` (the builder, reusing fiche 03's `RepeaterField` for the field list rather than a second repeater) and `routes/form-submissions.tsx` (list/filter/detail/bulk actions/CSV export via `lib/csv.ts`/GDPR search & erase by e-mail), with an unread-count nav badge.
- 16f63f6: Bring form definitions and submissions closer to parity with premium form plugins (Gravity Forms/WPForms) — fiche 47, tasks 1-4 and 6-11 (task 5, a contract B `form` block, stays out of scope pending its own RFC).
  
  - **`@cogenta/forms`**: the field vocabulary gains a tenth kind, **`file`** — a deliberate reopening of ADR-0026's own renoncement, decided live with the user (fiche 47 §8). A `file` field's bytes are sniffed against a closed category vocabulary (`image`/`pdf`/`document`/`text`, via `sniffFormFileCategory`/`assertAllowedFormFile`) — never trusted from a filename or declared `Content-Type` — with a hard, unconfigurable size ceiling (`FORM_FILE_HARD_MAX_BYTES`) on top of any per-field `maxSizeBytes`. `FormFieldDefinition` gains `showIf` (task 1: a field masked by an unmet condition is neither required nor validated, evaluated server-side against the raw submission — `evaluateCondition`/`isFieldVisible`) and `acceptCategories`. `FormDefinition` gains `steps` (task 2: real multi-step forms, validated so every field belongs to exactly one step), `notifyChannels` (task 4: extra Slack/Discord/Telegram/webhook targets via `@cogenta/channels`'s existing `ChannelRegistry`/adapters, never a new transport — `notifyChannels()`) and `captcha` (task 10: optional, off by default, Cloudflare Turnstile verification via `verifyCaptcha`, a single HTTP call, no client SDK dependency). `FormDefinitionStore` gains `duplicate` (task 11: an independent, inactive copy, never carrying submissions over). `FormSubmissionStore` gains `addNote`/`listNotes` (task 8: operator-only notes, never exported) and `list()` gains `query`/`from`/`to` (task 7: full-text search across a submission's own values plus a date range, SQL-filtered then bounded in-memory for the text match — the same honest tradeoff `searchByEmail` already makes). New `csv.ts` (`csvField`/`toCsvRow`/`csvHeaderRow`/`csvSubmissionRow`) mirrors `packages/admin/src/lib/csv.ts`'s CWE-1236 formula-injection guard for the new server-side streamed export (task 9).
  - **`@cogenta/core`**: four new `FORM_*` error codes (`FORM_FILE_REJECTED`, `FORM_CAPTCHA_REQUIRED`, `FORM_CAPTCHA_FAILED`, `FORM_STEP_INVALID`), each mapped to a 4xx status in `@cogenta/api`'s `STATUS_BY_CODE`.
  - **`@cogenta/api`**: `createFormsRouter` gains `storage` (a `StorageDriver`, for the `file` field — absent means every upload is refused rather than silently accepted) and `channelRegistry` options; `POST /api/forms/{name}/submit` now accepts `multipart/form-data` (sniffing and storing any uploaded file before validation), understands multi-step submissions (`_step`/`_accumulated`, answering `202 {status:'step', nextStep, values}` for every step but the last, exactly as before for a single-page form), verifies the CAPTCHA on the final step when a form has one enabled, and dispatches `notifyChannels` alongside the existing e-mail notification. New routes: `POST /api/forms/{id}/duplicate`, `GET`/`POST /api/forms/submissions/{id}/notes`, and `?q=`/`?from=`/`?to=` on `GET /api/forms/submissions`. New export `streamSubmissionsCsv` — an async generator, never buffering the whole export in memory (a single-form export uses that form's own field names as fixed CSV columns; a cross-form export pays one bounded pre-pass to discover columns before streaming rows for real).
  - **`@cogenta/cli`**: `readBody` (`serve.ts`) now parses a real `multipart/form-data` body (reusing `@cogenta/api`'s existing zero-dependency parser) as raw bytes rather than corrupting it through a UTF-8 text decode — this is what makes a `<form enctype="multipart/form-data">` post work with no JavaScript at all, for `/api/forms/*` and (latent, previously dead in production) `/api/media` alike. `forms-page.ts` renders a `file` input, one step at a time for a multi-step form (each step a plain chained `<form method="post">`, no client framework — the original page-load timestamp is carried forward unchanged rather than refreshed, so the anti-abuse fill-delay check keeps its meaning across the whole flow), and the Turnstile widget only on the final step of a form that opted into the CAPTCHA. New route `GET /api/forms/submissions/export.csv` (admin-only, streamed directly to the response, outside `RestResponse`'s JSON-only shape — same reasoning as `/api/media/{id}/file`).
  - Admin (`@cogenta/admin`, private, no changeset): `routes/forms.tsx` gains per-field `showIf`/step/file-category editing (plain text columns on the existing field repeater, not a second visual builder), `notifyChannels`/CAPTCHA configuration, and a Duplicate action; `routes/form-submissions.tsx` gains a search box, a date range filter, internal notes, the referrer (stored since fiche 16 but never shown before), and a server-streamed CSV download (`downloadSubmissionsCsv`) replacing the old 200-row-capped client-side export.
  
  A form with none of these features enabled behaves exactly as it did before this change — `steps`/`notifyChannels` default to empty and `captcha` defaults to disabled, and no field's `showIf` means no field's requiredness changed. The form stays fully functional with no JavaScript at every task except the CAPTCHA widget itself, which is opt-in and inherently third-party script.

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
- Updated dependencies [46572ba]
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
  - @cogenta/channels@0.3.0
