---
'@cogenta/schema': minor
'@cogenta/core': minor
---

Add the content persistence layer: typed CRUD, drafts, versions, diff and i18n, portable
across Postgres, MySQL, MariaDB and SQLite.

`createContentStore({ db, collection })` gives a collection its create/read/update/
delete/list, plus `publish`, `unpublish`, `history`, `readVersion`, `restore`, `diff`,
`translations` and `resolveLocale`. `createSchemaTables(db, collections)` builds the
physical schema the store expects — the same DDL the migration generator will emit, so
the two cannot drift.

The entry table holds the **live** state, which is what the public renderer reads. With
`versioning.drafts`, editing a published entry writes a version row and leaves the live
row alone: a draft is unreachable through `read(id)` because it is not there, not
because a filter remembered to exclude it. Publishing moves the live row onto the
working version. `versioning.keep` bounds the history, and the live version is never
pruned.

Pagination is by keyset cursor, never by offset: a cursor is the sort value and the id of
the last row handed out, so entries inserted concurrently cannot shift a window and make
a reader see the same entry twice or miss one. A cursor taken under one ordering is
refused under another.

Identifiers are UUIDv7 minted by the application (ADR-0015) — no `RETURNING`, no
`insertId`, and content keeps its identity across dev, staging and production. Blocks are
one row each, ordered, with a stable `_key` (contract A), so "which pages use this
medium", cache-tag invalidation and per-block RAG chunking stay possible. Content is one
entry per language (ADR-0014): `status`, `publishedAt` and `version` are per language,
and a missing locale renders through one of three explicit strategies — show the
original, hide it, or report it missing.

Core gains three error codes — `CONTENT_NOT_FOUND`, `CONTENT_INVALID` and
`CONTENT_CONFLICT` — so the content layer reports what failed with a code callers can
branch on, instead of borrowing `CONFIG_INVALID` for an editor's mistake.
