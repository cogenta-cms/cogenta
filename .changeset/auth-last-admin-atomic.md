---
"@cogenta/auth": patch
"@cogenta/api": patch
"@cogenta/core": patch
---

"At least one active admin" is now enforced atomically. `UserStore.setRoles`, `setStatus` and `anonymize` take an admin-guard lock and re-count the other active admins inside the same transaction as the write, so a bulk disable naming every admin, or two simultaneous changes, can no longer leave the site with nobody able to administer it (`FORBIDDEN` for the refused one); `POST /api/users/bulk` also applies its changes in order. The SQLite handle now tells a transaction nested in the caller's own from another caller's by async call chain rather than by a per-handle counter, so two requests on one handle no longer share a transaction (and its rollback). Adds the `cogenta_auth_locks` table.
