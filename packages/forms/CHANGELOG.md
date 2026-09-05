# @cogenta/forms

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
