---
'@cogenta/core': minor
---

Wire Drizzle onto the database layer, on all three dialects.

Every dialect goes through Drizzle's **proxy** driver rather than the driver Drizzle
ships for it, so ORM traffic runs on the same connection as raw SQL — one pool, the same
transaction pinning, the same typed errors, and the same rule that a parameter value
never reaches an error message. On SQLite there was no choice anyway: `better-sqlite3` is
forbidden by rule R10 and `node:sqlite` has no Drizzle driver.

`SqlExecutor` grows three things the bridge needs and nothing else has to use: `dialect`
moves down from `DatabaseHandle` so a transaction executor knows what it is talking to,
`execute()` runs SQL that is already rendered for the dialect without encoding its values
a second time, and `asArrays` returns rows as ordered values — a join selecting
`users.id` and `posts.id` loses one of them in an object keyed by column name.

`db.transaction()` on a proxy instance is not usable. Use `drizzleTransaction`, which
runs the work inside a handle transaction and rebuilds the instance on its executor, so
every statement lands on the pinned connection and rolls back with it.
