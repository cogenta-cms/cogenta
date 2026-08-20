# @cogenta/auth

## 0.4.0

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

### Patch Changes

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
- Updated dependencies [[`54ca689`](https://github.com/cogenta-cms/cogenta/commit/54ca6894449fcdd29ff76eef4514cda7c081f483), [`0692713`](https://github.com/cogenta-cms/cogenta/commit/06927130c15f7bc95ea97839cb50f67de87bd668), [`36744d3`](https://github.com/cogenta-cms/cogenta/commit/36744d3bc8e74a39fa6c68bdd78804fad1d8f069), [`7b7ec0b`](https://github.com/cogenta-cms/cogenta/commit/7b7ec0b897735c1323bb733ae6ba76a522f72669), [`0ca8a79`](https://github.com/cogenta-cms/cogenta/commit/0ca8a797288624a3c4d53ca0942687d9e570b186), [`c392e24`](https://github.com/cogenta-cms/cogenta/commit/c392e24880a29388fc63a08388042bf163817619), [`562c9c1`](https://github.com/cogenta-cms/cogenta/commit/562c9c1ee4d52b3e7f624e3b54ae033c2bd01e1c), [`edf5623`](https://github.com/cogenta-cms/cogenta/commit/edf562389652c4f6afb58d6e3f166de233d063e2), [`db307e0`](https://github.com/cogenta-cms/cogenta/commit/db307e068f4d029d98526c74d0ab9d56e531b73b), [`49815b9`](https://github.com/cogenta-cms/cogenta/commit/49815b95ad87cd37e7781cbb5a726327226259dd), [`122da7a`](https://github.com/cogenta-cms/cogenta/commit/122da7ad20396966b4d44538b0842f8efb9b7621), [`2fb2101`](https://github.com/cogenta-cms/cogenta/commit/2fb210109824f000788d512fef748f1066f65551), [`0e90b32`](https://github.com/cogenta-cms/cogenta/commit/0e90b32c19247430987e84cc1fd0be57e1ad4f3e), [`d0bfa1d`](https://github.com/cogenta-cms/cogenta/commit/d0bfa1d71166adfb0c66a296c4cf490ddd58a218), [`95acedf`](https://github.com/cogenta-cms/cogenta/commit/95acedf48920dba08e443e56ca4464bcfd394d34), [`6e5df34`](https://github.com/cogenta-cms/cogenta/commit/6e5df34e6f428c36712bc80e76c37d0cd7e33b1c), [`bebbab8`](https://github.com/cogenta-cms/cogenta/commit/bebbab881761fb86a28cdbbcb95b5960429f2a29), [`e75b23e`](https://github.com/cogenta-cms/cogenta/commit/e75b23ec985099f2eabe6eabb7b4c86115006996), [`4513a71`](https://github.com/cogenta-cms/cogenta/commit/4513a71a15dfa7a716bf9c8fcd02f93df927f230), [`e8061e2`](https://github.com/cogenta-cms/cogenta/commit/e8061e24ec41e9a99f5c852c28649f62656b0cc9), [`54409f3`](https://github.com/cogenta-cms/cogenta/commit/54409f3ff4640518d5d4149bef73a29142ba0d0a), [`f47e893`](https://github.com/cogenta-cms/cogenta/commit/f47e893b3e2b674b028af54d2146c7e83c32617c), [`2285720`](https://github.com/cogenta-cms/cogenta/commit/2285720ae29de05e96a8d776fd5ae14f2fe4fd0d), [`46572ba`](https://github.com/cogenta-cms/cogenta/commit/46572bae836b8182c2a3563e8f0e2da74d7e82ee), [`2c1af5d`](https://github.com/cogenta-cms/cogenta/commit/2c1af5d8ec08b460ba80a2228ceca6f4ff89eef2), [`745ebd8`](https://github.com/cogenta-cms/cogenta/commit/745ebd8f80ea94d916a370af0f9615e6565c0d00), [`9e67928`](https://github.com/cogenta-cms/cogenta/commit/9e67928b4b2fd58cc4e72f42f7a265aac8460567), [`954460e`](https://github.com/cogenta-cms/cogenta/commit/954460e63748a58c47d28292b1691425775b7e36), [`3824e8e`](https://github.com/cogenta-cms/cogenta/commit/3824e8e043e5d4036a47bd1e0b9d86c44c45a5a7)]:
  - @cogenta/core@0.5.0
  - @cogenta/schema@0.4.0

## 0.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944)]:
  - @cogenta/core@0.4.0
  - @cogenta/schema@0.3.0

## 0.2.0

### Minor Changes

- [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Password reset, absent until now (L13 task 6). A person who forgot their
  password had no way back: `users create` was the only account command, so
  the recovery procedure was "have an administrator make you a second
  account".
  
  `@cogenta/auth` gains `createPasswordResetStore`, backed by a new
  `cogenta_password_resets` table that `ensureAuthTables` creates like the
  others. A token is 32 random bytes stored only as a SHA-256 hash — a leaked
  table hands out nothing live, the same posture as a session token — bound to
  one user, valid 30 minutes, and usable exactly once. Single use is enforced
  by `update ... where used_at is null` reporting `rowsAffected`, so two
  simultaneous redemptions produce one `ready` and one `used`, not two
  successes. Issuing a second reset deletes the first: a person who asks again
  because the mail never arrived must not leave two working links behind.
  
  The token is deliberately **not** a signed payload. A signature can be
  checked without touching the database, and that is precisely what must not
  happen — single use and revocation are properties of a row, and an
  already-used token still carries a perfectly valid signature.
  
  `@cogenta/cli` gains `cogenta users reset-password`, in two halves:
  `--email <address>` issues a token and mails it; `--token <token>
  [--password <text>]` redeems it, replaces the password, and revokes every
  session the user had. That last step is why the CLI composes the stores
  rather than calling one: a reset that leaves whoever knew the old password
  signed in has reset nothing.
  
  The mail goes through `@cogenta/channels`'s existing email adapter — a new
  workspace dependency of `@cogenta/cli`, and the project's one way out for
  mail rather than a second mailer. Its only transport is the local file one
  (a real SMTP transport remains a documented gap in that package), so the
  command writes a real message to `.cogenta/mail` and says so in as many
  words instead of pretending anything was posted. Because the token never
  appears on the terminal, the mail is the only place it exists.
  
  Since no admin route can receive a reset click yet (that lands with L11),
  the message carries the token and the exact command rather than a link that
  would 404 today.

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

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/schema@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/schema@0.1.2

## 0.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/schema@0.1.0
