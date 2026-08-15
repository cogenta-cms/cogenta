---
'@cogenta/core': patch
---

The MySQL/MariaDB driver's `transaction()` now retries automatically (up to
3 attempts) when InnoDB reports `ER_LOCK_DEADLOCK`. A deadlock victim is not
an application bug — MySQL expects the losing transaction to restart from
scratch — but until now the raw error propagated straight to the caller,
so two concurrent writers touching the same rows (two agents publishing at
once, not just @cogenta/schema's own ten-concurrent-insert test) could
surface a hard failure instead of one of them transparently retrying.

Found via CI: @cogenta/schema's cursor-pagination-under-concurrent-insert
integration test was deterministically deadlocking on both the mysql and
mariadb dialects (they share this same driver), not a flake — reproduced
on two separate CI runs before the fix.
