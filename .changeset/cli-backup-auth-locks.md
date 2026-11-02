---
"@cogenta/cli": patch
---

`cogenta backup` no longer includes the `cogenta_auth_locks` table (the last-admin guard's seeded lock row): restoring it into a site that had already seeded its own failed with `RESTORE_CONFLICT`. Backups taken on earlier versions restore as before. `cogenta restore apply` now reminds you, when accounts are restored, that authenticator secrets are encrypted with `COGENTA_AUTH_SIGNING_KEY` and that `cogenta users reset-mfa` is the recovery under a different key.
