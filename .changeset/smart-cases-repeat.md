---
'@cogenta/core': minor
---

Add the driver system: interface, registry, selection and health reporting.

`createDriverRegistry` holds the implementations of one infrastructure need and picks
between them by two different rules. When the configuration **names** a driver, that
driver is used and any failure is fatal — starting on the filesystem because Redis was
down, and saying nothing, would be a silent downgrade of someone's site. When it names
nothing (or `auto`), the first available driver wins in tier order, and failures fall
through to the next one, so `npm create cogenta` produces a working site with nothing
else installed.

Every selection carries a `reason` and the list of what was `skipped` and why, so the
admin and `cogenta doctor` can state "job queue: database (degraded), because Redis is
absent". A driver whose availability probe throws counts as absent rather than crashing
startup, and `dispose()` is idempotent because shutdown paths overlap.
