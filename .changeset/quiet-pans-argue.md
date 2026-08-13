---
'@cogenta/core': minor
---

Add the migration engine: tracking table, apply, rollback and status.

`down()` is a required method, not an optional one. AGENTS.md says migrations are always
reversible, and a type that permits an irreversible migration turns that rule into a
suggestion.

A destructive migration refuses to run without **both** an explicit confirmation and a
verified backup, and the refusal names what each one will do to existing data so the
confirmation is informed rather than reflexive.

An applied migration that changed is refused rather than re-run or ignored: two
environments that ran different SQL under the same id differ in ways nothing records.
`status()` reports the mismatch without throwing, so a diagnosis can still run.

Migrations take an exclusive lock, so two deployments cannot migrate at once — the
primary key does the work, and a lock left by a crashed process is taken over after
fifteen minutes. Each migration runs in a transaction where the database has
transactional DDL. **MySQL does not**, so a failed migration there may be half applied;
the engine says so in the error instead of claiming a rollback that never happened.
