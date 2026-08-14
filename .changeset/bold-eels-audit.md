---
'@cogenta/api': minor
'@cogenta/cli': minor
---

Add `GET /api/audit` (filterable by `actorId`/`action`/`collection`/`since`,
paginated by `limit`) and `GET /api/audit/verify` (recomputes the hash
chain, `AUDIT_CHAIN_BROKEN` naming the first mismatch on tampering) — both
restricted to the `admin` role.

`@cogenta/auth`'s hash-chained audit log (`createAuditLog`) existed since it
was built as generic core infrastructure, but nothing wrote to it and no
route read from it. `cogenta serve` is now its first writer: every
successful login, logout, content create/update/delete/publish/restore and
media upload/update/delete records an entry, at the transport layer rather
than inside each service — one place, so no future write path has to
remember to call it separately. Recording never blocks or fails the
response it is auditing.
