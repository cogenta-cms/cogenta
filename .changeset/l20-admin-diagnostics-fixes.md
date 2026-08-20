---
'@cogenta/core': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

L20 audit — six real bugs in the admin's diagnostic and dashboard screens,
fixed:

**`@cogenta/core`:** `DriverSelection`/`SkippedDriver` gain `reasonCode`
(`DriverSelectionReason`/`SkipReasonCode`) alongside the existing `reason`
string — a stable code a translated UI can look up instead of showing
`createDriverRegistry`'s English prose ("named in the configuration", "redis
not available") verbatim. Purely additive; `reason` is unchanged.

**`@cogenta/api`:** `HealthDoctorCheck` gains an optional `reasonCode`
field, carrying the same information through `GET /api/health-report`.

**`@cogenta/cli`:** `cogenta serve` now actually constructs a
`ScheduledTaskRegistry` and mounts `createScheduledTasksRouter` under
`/api/scheduled-tasks` — before this, the admin's "Tâches planifiées" screen
had real, tested client and server code on both ends, but nothing ever
wired them together, so every request 404'd through the generic content
router. The seven recurring jobs that used to run on independent
`setInterval`s (scheduled publication, the tools-queue drain, the 404 log
purge, audit integrity, the trash sweep, forms GDPR retention, channel
notification flush, analytics retention) now run through one heartbeat
driving `registry.tick()`, at the same per-task cadence as before — "run
now" from the admin is real, and last-run/next-run/history reflect the
actual thing. `RuntimeExtras` gains an optional `scheduledTasksRouter`.
`DoctorCheck` gains `reasonCode` and a typed `skipped` shape, matching
`@cogenta/core`.

No breaking changes. A caller that never touches the new fields is
unaffected; a site with no `ScheduledTaskRegistry` constructed by hand
(a test harness building a bare `Site`) simply never gets the route mounted,
same degradation as `agentsRouter`.

Also fixed, admin-only (`@cogenta/admin`, private, no changeset): the
"Vues par jour" analytics chart now draws one bar per calendar day of the
selected period — zero-filled where the server sent nothing — instead of
stretching a sparse response into a single filled rectangle; the "Interroger
le site" assistant tab shows an honest state instead of rendering blank when
a provider is configured but `assist.chat` specifically is disabled; and the
Agents screen degrades to its already-honest "no agent running" empty state
instead of showing the raw `"No route matches this path."` wire text when no
`AgentRegistry` is mounted (still the case on every real `cogenta serve`
today — that gap is documented, not new).
