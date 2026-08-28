---
"@cogenta/api": patch
"@cogenta/cli": patch
---

Fiche 61 task 1 — every account mutation now lands in the audit log, not just
anonymization. `applyUserChange` (`users-router.ts`, shared by the single
`PATCH /api/users/{id}` route and `POST /api/users/bulk`) now records a
`user.update` entry, naming exactly which roles and/or status changed, for
every account it actually mutates — a bulk action that used to leave no
audit trail at all now writes one entry per account it touched, and none for
an account it refused (the last-admin guard, an anonymized row). Resending
or cancelling an invitation (`POST`/`DELETE /api/users/{id}/invite`) now
records `user.invite_resend`/`user.invite_cancel`.

`cogenta serve`'s `recordUserAudit` no longer re-derives a `user.update`
entry by sniffing the HTTP path shape — that was the mechanism `/api/users/
bulk` never matched in the first place, which is how bulk actions went
unaudited. Single-account role/status changes are still recorded exactly
once, now from inside the router that actually makes the change.
