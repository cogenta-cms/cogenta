---
'@cogenta/core': minor
'@cogenta/auth': minor
---

API keys — machine-to-machine authentication, absent until now (L13 task 8).
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
