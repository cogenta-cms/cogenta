---
'@cogenta/core': minor
---

Add the Postgres and MySQL/MariaDB database drivers.

Both run the same contract suite as SQLite, against real servers — the L0 exit criterion
that the three databases pass one integration suite rather than three that resemble each
other.

`postgres` (postgres.js) and `mysql2` are optional peer dependencies loaded through a
dynamic import, so a site on SQLite installs neither and the default install still has no
runtime dependency. postgres.js was chosen over `pg` because it has no transitive
dependencies at all. Neither package appears in the published type declarations: each
driver describes the slice of client API it uses structurally.

A transaction reserves a single connection for its whole duration. Issuing `BEGIN` on a
pool would start the transaction on whichever connection happened to be free and run the
following statements on others, silently outside it — a bug that only appears under
concurrency, which is where it costs the most. Nested transactions become savepoints on
both, matching SQLite.

`database.poolSize` is configurable and defaults to 5: shared hosting allows very few
connections, and exhausting them takes a site down rather than slowing it. MySQL is
opened with UTC and `dateStrings`, so a row does not read back differently depending on
where the process runs.
