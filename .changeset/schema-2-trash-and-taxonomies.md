---
'@cogenta/schema': minor
'@cogenta/core': minor
---

**Breaking: contract A moves to `schema@2.0`** (ADR-0022) — the trash and native
taxonomies, in one version bump with one migration.

### `delete()` changed meaning without changing signature

`ContentStore.delete()` no longer issues a `DELETE`. It writes the new system
field `deletedAt` and leaves every row where it was — versions, blocks, join
rows, and the `translation_of` of any translation. Two new methods complete it:

- `purge(id)` is the real `DELETE`, i.e. what `delete()` used to do;
- `untrash(id)` takes an entry back out, with the status it went in with;
- `purgeExpired()` removes what has outlived the collection's `trash.retainDays`.

**How to migrate.** Code that called `delete()` to genuinely destroy a row — an
import script that cleans up, a test that resets — must now call `purge()`.
Nothing will fail loudly if you do not: the call still succeeds and simply
leaves the row behind, which is the worst kind of break and the reason it is
called out first here. `trash: false` on a collection restores the old
behaviour outright.

### Every read now filters the trash by default

`read`, `list`, `translations`, `resolveLocale` and `history` exclude trashed
entries unless the caller passes `trashed: 'include' | 'only'`. That direction
is deliberate: a renderer, a sitemap or a headless client written against 1.0
keeps serving live content with no change at all.

### `restrict` is now enforced in application code

Trashing is an `UPDATE`, so a foreign key can no longer refuse it. `delete()`
checks referring entries itself and names what blocks ("2 entries of
\"article\" still reference it"); `purge()` runs the same check so both paths
give the same sentence. This needs the sibling collections, so
`createContentStore` takes a new optional `siblings` option — **pass it**. Left
out, only self-references are checked; nothing is destroyed, since `purge()`
still meets the real foreign key, but a trash that should have been refused
will be allowed.

`withReadOnlyStore` refuses `delete`, `untrash`, `purge` and `purgeExpired`.

### Native taxonomies

`defineTaxonomy()` is a second top-level declarable object beside
`defineCollection()`, and `f.taxonomy({ of, many })` a new field kind. A term
carries `id`, `parent`, `slug`, `position` and `labels` indexed by locale, and
deliberately no `status`, `version` or `translationOf`: a classification is not
content, so ADR-0014 does not govern it.

The tree is stored as a **materialised path** maintained on write, never a
recursive CTE: "everything under this term" is one `like` that Postgres,
MySQL/MariaDB and SQLite answer identically (ADR-0006). Paths are built from
ids, so renaming a term rewrites nothing and only a move pays. Nesting is
bounded at 12 levels so the indexed column stays inside InnoDB's key limit.

`createTaxonomyStore()` is the term store; `createSchemaTables(db, collections,
taxonomies)` and `dropSchemaTables` take the taxonomies as a third argument.

### The migration

`schema2Migration({ collections, taxonomies })` adds `deleted_at` to every
entry table and creates the terms and join tables. It is marked **destructive**,
so the migrator demands an explicit confirmation and a verified backup: its
`down` drops `deleted_at` and the terms tables, which permanently discards
everything in the trash and every classification — entries sitting in the trash
silently become live again with no record they were ever deleted.

### Also

`.cogenta/schema.json` reports `schema@2.0`, carries the declared taxonomies and
each collection's trash window, and `buildSchemaDocument`/`renderSchemaJson`
take the taxonomies. `@cogenta/core` gains the error codes the two features
need: `CONTENT_REFERENCED`, `CONTENT_NOT_TRASHED` and the `TAXONOMY_*` family.
