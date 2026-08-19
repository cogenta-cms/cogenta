---
'@cogenta/api': minor
'@cogenta/cli': minor
---

`cogenta serve` now actually sweeps the trash. `purgeExpired()` has existed on
every `ContentStore` since ADR-0022, but nothing called it — a site's trash
grew forever despite `trash.retainDays` implying otherwise. `runServe` now
ticks it once at startup and then on a daily `setInterval` (override with
`trashPurgeTickMs`, mirroring `scheduledPublishTickMs`), one collection's
expired rows at a time, never fatal per collection.

`createOpsStatusRouter` gains an optional `trash` provider and a third route,
`GET /api/trash-status` (admin-only, same as `/api/security-status` and
`/api/webhooks-status`): `{ retainDaysByCollection, lastRunAt, lastPurged }`,
so an admin screen can say when the sweep last ran instead of only that it is
configured to happen. A caller that does not wire `trash` gets an honest
all-empty answer instead of a crash.

Fixes a real gap in the audit log: `POST .../untrash`, `POST .../purge`,
`POST .../unpublish` and `POST .../duplicate` were silently unaudited —
`recordContentAudit` only ever recognised `publish` and `restore` among
sub-actions, treating every other one as a read. All four now record
`content.untrash`, `content.purge`, `content.unpublish` and
`content.duplicate` respectively.
