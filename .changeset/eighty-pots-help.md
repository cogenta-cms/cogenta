---
'@cogenta/core': minor
---

Add the `database` job queue driver — the degraded tier that needs no Redis and no
persistent worker.

Jobs are claimed with `FOR UPDATE SKIP LOCKED` on Postgres, MySQL and MariaDB, and under
the write lock on SQLite. Two different mechanisms, one guarantee, proven by one contract
suite: L0's acceptance criterion is that two concurrent workers never process the same
job, and it is asserted with real connections racing on a real database rather than a
mock. A claim that loses an InnoDB deadlock retries, because both MySQL and Postgres
document that as the remedy rather than a failure.

A worker only claims jobs it has a handler for, so two workers with different handlers
take their own work instead of locking jobs they would have to put back. A job whose
worker dies is released when its lease expires. Failures retry with exponential backoff
and stop at `maxAttempts`, recording why.

Two dialect traps are now handled in the db layer rather than by callers: `LIMIT` renders
as a literal, because MySQL prepared statements reject a placeholder there, and the SQLite
driver serialises statements per file within a process — `node:sqlite` is synchronous, so
a second connection issuing a write while the first holds a transaction deadlocks the
event loop rather than waiting.
