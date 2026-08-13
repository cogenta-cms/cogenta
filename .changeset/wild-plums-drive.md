---
'@cogenta/api': minor
'@cogenta/cli': minor
'@cogenta/admin': patch
---

Add `cogenta serve` — a real HTTP server over `@cogenta/api` and `@cogenta/auth`, and
the `/api/auth/*` REST routes (`login`, `totp`, `session`) those two now share through
`@cogenta/api`'s new `createAuthRouter`.

The actor a request authenticates as comes from one function, `resolveActor` — a bearer
token resolved through `@cogenta/auth`'s sessions, never trusted further than that — and
both `/api/content/*` and `/api/graphql` call it, so there is exactly one answer to "who
is asking", not a REST answer and a GraphQL answer that could drift apart.

Collections load from `cogenta.schema.ts` next to the config file, the same
dynamic-import convention `migrate.ts` already used for migrations. `serve` refuses to
start without `COGENTA_AUTH_SIGNING_KEY` rather than inventing one, since a signing key
that changes on every restart would silently invalidate every in-flight MFA ticket.

Passkey ceremonies and TOTP enrolment are not in this router yet — both need a challenge
held between two requests, which is deliberately out of scope for this pass and tracked
for L2 task 3.
