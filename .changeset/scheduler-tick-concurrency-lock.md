---
'@cogenta/schema': patch
---

Fix a real race in `createScheduledTaskRegistry`'s `tick()`: it used to read a task's last run and decide it was due with no atomic write between the two, so two `cogenta serve` replicas (or a replica racing a `cogenta cron` invocation) against the same database could both see a task as due and both execute it at once — including the destructive trash-purge sweep.

`tick()` now claims a task with a compare-and-set `UPDATE` against a new internal table (`SCHEDULED_TASK_CLAIMS_TABLE`) before running it: only one of two racing claims can win, and the loser skips the task for that tick rather than running it. The same guarded-`UPDATE`-and-check-`rowsAffected` shape already used by `@cogenta/commerce`'s stock guard and `@cogenta/core`'s database job queue — no dialect-specific locking primitive, the same query runs unmodified on SQLite, Postgres and MySQL/MariaDB.

No public behavior changes for a single-process site: `list()`, `get()`, `runNow()` and the timing of `tick()`'s due-check are unaffected. `CreateScheduledTaskRegistryOptions` gains an optional `claimsTable` field (defaults to `SCHEDULED_TASK_CLAIMS_TABLE`), and the new table is created automatically the first time the registry is used — no manual migration needed.
