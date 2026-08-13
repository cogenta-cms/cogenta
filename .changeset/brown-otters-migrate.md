---
'@cogenta/cli': minor
'@cogenta/core': patch
---

Add `cogenta migrate` — `status`, `up` and `down` — over the existing migration engine.

`status` lists every migration with the date and duration of its run, and marks the ones
that changed after they were applied here. That last case exits non-zero: two
environments that ran different SQL under the same id is the worst state to debug, and a
deployment script has to notice it rather than read it.

Migrations are plain ESM files in a `migrations/` directory next to the configuration
file, default-exporting an object with `up(tx)` and `down(tx)`. They are ordered by file
name, the id defaults to the file name, and the checksum is a hash of the file itself —
so a migration edited after it ran is detected without anyone maintaining a second
number. A project with no `migrations/` directory has zero migrations, which is not an
error: L0 ships no business schema at all.

A destructive migration still needs `--confirm-destructive` **and** `--backup-verified`.
The engine already refused without both; the CLI now makes the refusal actionable by
naming each destructive migration and printing its declared impact, instead of asking
the operator to go and read the files.

Core fix, found by running the command from a subdirectory: a relative path in a config
file is now resolved against **that file**, not against the shell's working directory.
`cogenta migrate status` run from `src/` used to open an empty `./site.db` next to `src/`
and report an already-migrated database as entirely pending. The same applies to
`cache.path` and `storage.path`. Absolute paths, server URLs and `:memory:` are
untouched, and configuration that comes from the environment alone is unaffected.
