---
'@cogenta/core': patch
---

The Postgres driver sends the additive DDL of the startup reconciliation with `if not exists` (`alter table … add column`, `create [unique] index`). Every table module adds a late column or an index by trying the statement and ignoring the "already exists" failure; each of those was an `ERROR` line in the Postgres server log at every start (about eighty per boot on the live blog). Nothing else changes: an existing column keeps its type, an existing index is kept.
