---
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

MFA is no longer a gate at sign-in, and the admin gains a generic notices
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
