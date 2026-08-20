---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/analytics': minor
---

Fiche 28 (tâches planifiées): a real scheduled-task registry and its admin
screen — task 1 (registry) and task 2 (screen) complete and tested; task 4's
concurrency-safe scheduled publication verified. `cogenta serve`'s own
wiring of the registry, and the standalone `cogenta cron` command (task 5,
for hosts with no permanent process), are **not done** — see below.

- `@cogenta/schema`'s `ScheduledTaskRegistry` (`createScheduledTaskRegistry`):
  each task declares a name, description, interval and run function; the
  registry persists every run (`cogenta_scheduled_task_runs`) — last run,
  duration, outcome, error — so "did the trash sweep run last night" survives
  a restart rather than resetting with an in-memory timer. `overdue` is
  computed from that persisted timestamp (fiche 28's own named pitfall: a
  detector that lives in memory is blind exactly when a restart makes it
  matter).
- `@cogenta/api`'s `createScheduledTasksRouter` (`GET /api/scheduled-tasks`,
  `GET .../{name}`, `POST .../{name}/run`, `GET .../queue`,
  `POST .../queue/{id}/retry`) — admin-only, thin read-through, "run now"
  never awaits its own audit write so a slow log never hangs the request.
- `@cogenta/core`'s `QueueDriver` gains `list()`/`retry()` — the "file" section
  of the screen, and the way a failed maintenance job (fiche 24's queue) gets
  retried from the UI instead of a terminal.
- `@cogenta/core`'s config gains `scheduler.mode` (`'internal'` |
  `'external-cron'`) and `backup.*` (interval/keep/dir) — resolved, defaulted,
  not yet consumed by `cogenta serve` (see below).
- Admin: `/scheduled` (new nav entry, admin-only at the route level — R4, the
  nav link itself is not the gate) — task table with last run/duration/
  result/next run, an overdue badge, "run now" with a confirmation dialog for
  a `destructive` task (the trash sweep), a queue section with retry, and a
  pointer to the dashboard's own scheduled-content list rather than a second
  copy of it.

**Genuinely not done, not just deferred quietly**: `cogenta serve` still
drives scheduled publication, the trash sweep, the 404-log purge and the
audit-integrity check on their own separate `setInterval`s, exactly as
before this fiche — none of them are registered with the new
`ScheduledTaskRegistry`. The registry and the admin screen above are real
and fully tested against a registry populated by hand in their own test
suites, but on a running `cogenta serve` today `/scheduled` would show an
empty task list, because nothing calls `registry.register()` there yet.
Wiring that in, and the `cogenta cron` command (task 5 — the fiche's own
§8 leaves "deliver now or later" as an open decision), is real remaining
work, not a rename or a config flag. Flagged here rather than left to be
discovered later.
