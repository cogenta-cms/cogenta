---
'@cogenta/core': minor
---

Add the database layer: the dialect abstraction, the SQLite driver and their contract
suite.

Callers write `` sql`… ${value}` `` and never a placeholder: Postgres wants `$1` where
MySQL and SQLite want `?`, and letting that reach a call site is the dialect leak the
design warns about. The same layer quotes identifiers per dialect and adapts values —
SQLite has no boolean and no date type, MySQL's `datetime` carries no time zone — so a
caller never has to know which database is connected. Interpolated values are always
bound; only `unsafeRaw`, named to say so, inserts text verbatim.

The SQLite driver uses Node's built-in `node:sqlite`, so the default install compiles
nothing and depends on nothing. `better-sqlite3` is deliberately avoided: it is native
code, and rule R10 forbids that without a fallback because it breaks on ARM, musl and
shared hosting — the deployments SQLite exists to serve. WAL mode, a busy timeout and
foreign keys are on from the first connection, and nested transactions map onto
savepoints so two functions that each want a transaction compose.
