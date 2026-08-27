---
"@cogenta/auth": minor
"@cogenta/api": minor
---

Fiche 67 tasks 1, 3 and 5: the audit log, the scheduled-tasks queue, and the
API key list now page instead of loading everything at once.

**Audit log** (`@cogenta/auth`'s `AuditLog.list`, `@cogenta/api`'s
`GET /api/audit`). `AuditFilter` gains `before: { at, id }` — strictly older
than that position in the `order by at desc, id desc` listing, the same
checkpoint shape `AuditChainPoint` already uses for a *different* purpose
(chain verification, never confused with this listing cursor). The route
answers with `page: { hasMore, nextCursor }` alongside the existing `data`
array; `?after=` walks the cursor. Additive: an existing caller that never
sends `after` or reads `page` keeps getting the same `data` shape, just
capped at a new, smaller default page size (50 instead of the previous
unpaginated 200) — anyone relying on more than 50 entries in one call now
paginates or raises `?limit=` up to the unchanged ceiling of 200.

**Scheduled-tasks queue** (`GET /api/scheduled-tasks/queue`). Gains
`?limit=` (bounded to 500), forwarded to the existing
`QueueDriver.list`/`ListJobsOptions.limit` both drivers (`database`,
`bullmq`) already implement — no driver interface change. Absent `?limit=`
keeps the driver's own default (50) exactly as before.

**API keys** (`@cogenta/auth`'s `ApiKeyStore.list`, `@cogenta/api`'s
`GET /api/api-keys`). `ApiKeyStore.list` gains an optional
`{ limit?, offset? }`; both omitted still returns every key, unpaginated,
byte for byte — the shape every existing caller depends on. The route gains
`?limit=`/`?offset=` and answers with `page: { hasMore }` alongside `data`.

None of this is a breaking change: every route's `data` shape and every
store method's zero-argument call are unchanged.
