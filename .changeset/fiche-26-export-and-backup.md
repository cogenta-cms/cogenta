---
'@cogenta/core': minor
'@cogenta/export': minor
'@cogenta/cli': minor
---

Add `@cogenta/export`: content export/import (`export@1.0`, NDJSON, permission-aware),
media archive export (streaming ZIP, references or full bytes), full-site backup and
restore (`cogenta-backup@1.0`, engine-independent, checksummed, optionally encrypted
with a passphrase), and GDPR/RGPD personal-data export by email — fiche 26.

`@cogenta/core` gains nine error codes (`EXPORT_*`, `BACKUP_*`, `RESTORE_*`) and exports
`MEDIA_TABLE`, its media table's physical name, so a caller assembling a full-site
backup can name every table without depending on `@cogenta/core`'s internals.

`@cogenta/cli` gains four new commands: `cogenta export`, `cogenta import content`,
`cogenta backup create|list`, and `cogenta restore preview|apply`. Restoring a full
backup is **CLI-only, by design** — it overwrites the database an admin session would
be running against, so it is never exposed over HTTP; an admin instead applies a
*content* export (additive, reversible through the trash).
