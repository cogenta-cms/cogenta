---
"@cogenta/api": minor
"@cogenta/core": minor
"@cogenta/cli": minor
---

T09-04 (RGPD, audit 2026-09-01) — `exportPersonalData` (`@cogenta/export`) had zero
callers anywhere in the codebase; the legal obligation it exists to satisfy was not
exerciseable. `@cogenta/api`'s `users-router.ts` gains `GET /api/users/{id}/personal-data`
(self-or-admin, the same rule `GET /{id}` itself already follows) — assembles the
account, every collection entry it authored (via the same `storeFor` REST/GraphQL/theme
rendering already share, now a `UsersRouterOptions` field), and the honest `gaps` array
`exportPersonalData` reports for domains this codebase has no store for yet. The export
is itself journalled (`user.personal_data_export`, naming whether it was a self-request
or an admin acting on a third party). `cogenta serve` wires `storeFor` into the router;
the admin gains an "Export my personal data" button on the profile screen (every role,
self only) and an "Export the personal data of {{email}}" action per account row on the
Users screen (admin, any account). New direct dependency `@cogenta/api` → `@cogenta/export`
(R9: reusing an existing, tested assembly function rather than a second one).

T09-01 — `AuditLog.prune()` (`@cogenta/auth`) has existed since fiche 21 task 5 with no
scheduled caller, so an audit log grew without bound on every site regardless of
retention intent. `@cogenta/core` gains `security.audit.retainDays` (optional; absent —
the default — changes nothing, `0` is the explicit "never purge" opt-out). `cogenta
serve` registers a new daily `audit-prune` scheduled task (`Site.tickAuditPrune`) that
purges entries older than the configured window and journals the purge itself
(`audit.prune`, naming `retainDays`/`cutoff`/`prunedCount`) — a no-op when unconfigured.

T09-02 — `errorResponse` (`@cogenta/api`) gains a generic `Retry-After` header for any
`CogentaError` whose `details.retryAfterMs` names a concrete backoff (only the derived
integer ever reaches the wire, never `details` itself). `AUTH_RATE_LIMITED` — thrown by
login and forgot-password rate limiting — is the first beneficiary: a 429 that used to
say "try again later" in prose now carries a real, pollable `Retry-After`.
