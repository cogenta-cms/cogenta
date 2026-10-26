---
'@cogenta/auth': patch
'@cogenta/api': patch
'@cogenta/core': patch
'@cogenta/cli': patch
---

Harden the second factor (pentest 2026-10-26, F-01 and F-03).

- Starting, abandoning, letting expire or failing a TOTP re-enrolment no longer touches the active factor: the new secret waits as a pending enrolment (10 minutes) and replaces the active one only when its first code is confirmed, in one transaction that two simultaneous confirmations cannot both win. Changing or removing the factor also voids every sign-in ticket in flight.
- Changing or removing a confirmed factor now needs a fresh proof: `POST /api/auth/step-up` takes the current password or a current authenticator code and marks the session for five minutes. Turning TOTP off, starting a TOTP (re)enrolment, regenerating recovery codes and starting a passkey registration are refused with the new `AUTH_STEP_UP_REQUIRED` (403) until then, with no side effect. The first enrolment of an account with no factor needs only the session; MFA stays optional.
- A sign-in ticket is single-use (new `cogenta_login_tickets` table) and a TOTP time step is accepted once per account, so a replayed ticket or code opens no second session. The account is re-checked at the final step.
- Additive schema: table `cogenta_login_tickets` and column `cogenta_sessions.step_up_until`, created by `ensureAuthTables`; roll back with `drop table` / `drop column`. `cogenta serve` now audits second-factor changes (`auth.totp_enabled`, `auth.totp_disabled`, `auth.recovery_codes_regenerated`, `auth.passkey_added`, `auth.step_up`).
