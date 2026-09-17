---
'@cogenta/schema': patch
'@cogenta/api': patch
---

A slug already in use is refused by name, not by a 500

Creating or saving an entry whose slug another entry holds in the same language
reached the database's unique index, and the caller got `DB_UNREACHABLE` (500)
naming no field. The content store now checks every `unique` field before it
writes the live row and answers `CONTENT_SLUG_TAKEN` (409) for a slug,
`CONTENT_INVALID` for any other unique field, with `details.field`; the REST
error carries `field` for `CONTENT_SLUG_TAKEN` so a form can mark it. The index
stays the enforcement point under concurrent writes.
