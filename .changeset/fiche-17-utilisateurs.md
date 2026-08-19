---
'@cogenta/core': minor
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Account lifecycle: invitation by email, search/pagination/bulk actions, a
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
