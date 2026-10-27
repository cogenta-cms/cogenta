---
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/core': patch
'@cogenta/cli': patch
---

Harden the second factor (pentest 2026-10-26, F-01 and F-03).

- Starting, abandoning, letting expire or failing a TOTP re-enrolment no longer touches the active factor: the new secret waits as a pending enrolment (10 minutes) and replaces the active one only when its first code is confirmed, in one transaction that two simultaneous confirmations cannot both win. Changing or removing the factor also voids every sign-in ticket in flight.
- Changing or removing a confirmed factor now needs a fresh proof: `POST /api/auth/step-up` takes the current password or a current authenticator code and marks the session for five minutes. Turning TOTP off, starting a TOTP (re)enrolment, regenerating recovery codes and starting a passkey registration are refused with the new `AUTH_STEP_UP_REQUIRED` (403) until then, with no side effect. Adding the *first* authenticator or passkey to an account that has a password needs the same proof (a stolen session could otherwise plant a passkey backdoor or lock the owner out); an account with neither a password nor a factor needs only the session. MFA stays optional: this confirms identity, it never forces enrolment.
- A session created less than five minutes ago counts as stepped-up, so a passkey-only account (no password, no authenticator) signs in again with the passkey and then acts. `AuthService` gains `requiresStepUp(userId)`; `assertSteppedUp` now also reads `createdAt`. `GET /api/users` and `/api/users/me` expose `hasPassword`, and the admin's confirmation dialog tells such an account to sign in again.
- A sign-in ticket is single-use (new `cogenta_login_tickets` table) and a TOTP time step is accepted once per account, so a replayed ticket or code opens no second session. Passkey sign-in and passkey registration tickets are single-use too, spent before the assertion or attestation is checked, and the account is re-checked when a registration completes and at the final step of a sign-in.
- Additive schema: table `cogenta_login_tickets` and column `cogenta_sessions.step_up_until`, created by `ensureAuthTables`; roll back with `drop table` / `drop column`. `cogenta serve` now audits second-factor changes (`auth.totp_enabled`, `auth.totp_disabled`, `auth.recovery_codes_regenerated`, `auth.passkey_added`, `auth.step_up`, and `auth.step_up_failed` for a refused confirmation, never with the secret that was typed).
