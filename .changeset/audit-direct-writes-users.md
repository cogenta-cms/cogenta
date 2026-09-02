---
"@cogenta/api": patch
"@cogenta/cli": patch
---

T09-05 (audit 2026-09-01, partial) — account creation, password change and session
revocation now write their audit entry directly at the point of mutation in
`users-router.ts` (the same discipline fiche 61 task 1 already applied to
`applyUserChange`/`bulkRoute`/`inviteRoute`/`anonymizeRoute`), instead of `cogenta
serve` sniffing the HTTP path afterwards. `recordUserAudit`'s path-shape guesswork is
removed rather than kept as a redundant second writer — a caller that reaches account
creation, a password change or a session revoke through any future non-HTTP entry point
now produces the same audit entry a browser request always did, which sniffing a URL
could never guarantee. No route, request or response shape changes; `UsersRouterOptions`
gains an optional `storeFor` (see the RGPD export changeset in this same wave).
`api-keys-router.ts` and `role-permissions-router.ts` still use `cogenta serve`'s
sniffing (`recordApiKeyAudit`/`recordRolePermissionAudit`) — left for a follow-up, out
of this wave's budget.
