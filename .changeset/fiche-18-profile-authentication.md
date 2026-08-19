---
'@cogenta/core': minor
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Fiche 18 (profile and authentication): TOTP recovery codes, readable sessions
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
