---
'@cogenta/auth': minor
'@cogenta/core': minor
'@cogenta/schema': patch
---

Add `@cogenta/auth` — passwords, TOTP, WebAuthn passkeys, opaque sessions, progressive
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
