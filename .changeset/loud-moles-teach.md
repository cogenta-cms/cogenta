---
'@cogenta/auth': minor
'@cogenta/api': minor
---

Add TOTP self-service enrolment, so a sensitive role with no second factor yet can set
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

