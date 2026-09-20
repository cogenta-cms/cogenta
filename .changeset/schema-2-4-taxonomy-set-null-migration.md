---
'@cogenta/schema': minor
---

Add `schema24Migration`, which repairs the foreign key that let a deleted taxonomy term delete content.

A `f.taxonomy({ many: false })` field is stored in a column of the entries table, and
that column's foreign key was generated with `on delete cascade`: removing a term
deleted every entry carrying it, permanently and past the trash, since a row the
database removes was never soft-deleted. `tables.ts` now generates `on delete set null`
for that shape, but `create table if not exists` does nothing to a table that already
exists, so this migration is what reaches an installed site. `many: true` is unaffected
and keeps `cascade`, which is correct there: its term lives in a join table whose row
*is* the classification.

Postgres drops and re-adds the constraint; MySQL/MariaDB do the same through `drop
foreign key`, reading the current rule from `information_schema` first so an
already-correct constraint is left alone. SQLite has no way to alter a constraint at
all, so the entries table is rebuilt — and **not** by the manual's twelve-step
procedure, which cannot work inside a migration: `PRAGMA foreign_keys = OFF` is a no-op
while a transaction is pending, so `drop table` fires every cascade pointing at the
table and deletes the collection's whole `_versions` and `_blocks` history. Measured on
SQLite 3.46, and covered by a test. The rebuild therefore copies the referring tables
aside, empties them, rebuilds, and puts them back, all inside the migrator's
transaction.

The migration is marked `destructive`: the rollback faithfully restores `on delete
cascade`, and on SQLite the upgrade itself rebuilds tables. Both deserve the explicit
confirmation and the verified backup the flag demands.
