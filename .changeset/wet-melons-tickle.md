---
"@cogenta/schema": minor
"@cogenta/api": minor
---

Fiche 06 (versions et historique): `diff.ts` gains `diffWords`, `extractPlainText` and
`enrichWordDiffs` — a longest-common-subsequence word diff (R9: no diff dependency) that
turns a `changed` `text`/`richText` field's before/after into the actual words that moved,
rather than the flat "changed" a caller had to render on its own. `FieldChange` gains an
optional `words` property carrying this — populated only by `enrichWordDiffs`, never by
`diffValues`/`diffContent`/`diffBlocks` themselves, so the plain structural diff every
existing caller (REST, and any agent tool built on `ContentStore.diff`) already relies on
is unchanged unless it opts in.

`@cogenta/api`'s `GET /{collection}/{id}/diff` now calls `enrichWordDiffs` on the store's
result before returning it, so a corrected word in the admin's version history shows as a
corrected word instead of "changed" (VersionHistory, `packages/admin`). Additive only: the
response shape gains an optional field, no existing field changes meaning.
