---
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
'@cogenta/admin': minor
---

Add passkey registration and passkey login (WebAuthn), completing L2 task 3's second
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
