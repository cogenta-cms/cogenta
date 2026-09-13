---
'@cogenta/schema': patch
'@cogenta/core': patch
'@cogenta/agents': patch
'@cogenta/auth': patch
'@cogenta/commerce': minor
'@cogenta/fleet': patch
'@cogenta/analytics': patch
'@cogenta/forms': patch
'@cogenta/cli': patch
---

Fixes for defects that only a real MySQL, MariaDB or Postgres — or two
requests at once — ever exposed. The integration suites had not run against
those engines for a long time; with them back, each of these surfaced as a
production bug rather than a test problem.

**MySQL and MariaDB**

- `@cogenta/schema`: booleans were bound as the string `'true'` into columns
  `booleanColumn` builds as `tinyint`, which MySQL refuses. Maintenance mode
  and role permission overrides could not be saved there. A new
  `booleanValue(value, dialect)` sits beside `booleanColumn`.
- `@cogenta/auth`, `@cogenta/analytics`, `@cogenta/forms`, `@cogenta/commerce`,
  `@cogenta/fleet`: `LIMIT` was bound as a statement parameter, which MySQL
  rejects ("Incorrect arguments to mysqld_stmt_execute"). Password resets,
  credential lookups, the audit log, analytics summaries, form submissions,
  order e-mails and fleet telemetry were affected. All now use `limit()`.
- `@cogenta/core`: the media library's tag filter used `escape '\'`, an
  unterminated string on MySQL. The escape character is now `!`; nothing
  stored depends on it.
- `@cogenta/analytics`: the daily-salt table declared a `text` primary key,
  which MySQL cannot index. It is `varchar` there now.

**Postgres**

- `@cogenta/schema`, `@cogenta/agents`: looking up a pattern or a reference
  document by an id that is not a uuid raised a database error (a 500) instead
  of answering "not found". A new `isMintedId` guards those lookups.
- `@cogenta/schema`: the 404 log's upsert used an ambiguous `hits` column
  reference that Postgres refuses.
- `@cogenta/schema`: `create table if not exists` is not atomic on Postgres, so
  two replicas starting the scheduler at once could crash on a catalogue
  collision. Tolerated for that collision only.
- `@cogenta/core`: deleting a media folder swallowed an error inside its
  transaction, which Postgres treats as aborting the whole transaction.

**Two requests at once**

- `@cogenta/commerce` (**minor**): overlapping flushes of the order e-mail queue
  sent the same confirmation twice. Each message is now claimed before it is
  sent, through a new `'sending'` value of `OrderEmailStatus`. Code that
  switches exhaustively over that union must handle it. A process that dies
  mid-send leaves the row `sending`; it is not retried automatically.
- `@cogenta/schema`: two writers racing the same role override, or the same
  brand-new 404 path, could throw. Both retry a lost race now, bounded.
- `@cogenta/core`: two queue workers ticking together could deadlock on MySQL
  while reclaiming expired leases, and the error escaped the tick.
- `@cogenta/agents`: agent records were written in place, so a concurrent read
  could parse half a file (a 500), and two changes to the same agent could
  silently undo each other — an agent just enabled came back disabled. Writes
  are now atomic and serialised per agent.
- `@cogenta/cli`: the automatic update task could start a second install of the
  same versions while the first was still running.
- `@cogenta/cli`: a schema file that existed but could not resolve one of its
  own imports was reported as "No schema file found". It now says what failed
  to load.
