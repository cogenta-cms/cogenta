---
'@cogenta/schema': minor
'@cogenta/cli': minor
---

The editor sets an entry's visibility, and an existing site gains the column

The entry editor grows a « Visibilité » card beside the status: Public,
Private, Password protected, with the sentence each choice means and a
password field that is blank on every visit — nothing reads a password back,
so the screen must not pretend it holds one. Applied on its own button,
because the server gates it on `publish` while the form gates on `update`.

Two things a browser found that the tests had not:

**A site created before this version never gained the columns.** `create table
if not exists` does nothing to a table that already exists, so every write
failed with "no column named visibility" until someone hand-wrote a migration.
`createSchemaTables` now reconciles the store's **own** system columns at boot
— never a field a developer declared, which is a real migration with real data
questions.

**A locked page described itself to crawlers.** Its excerpt reached the meta
description and the JSON-LD, so the summary of a protected page was readable
without the password. A locked page is now rendered without its excerpt, and
its SEO head is built from its title and slug alone, `noindex`.
