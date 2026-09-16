---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': patch
---

Search and replace across content, previewed before it writes anything

`@cogenta/schema` gains `planEntryReplacement`: a pure function that says where
a phrase appears in an entry — text fields, rich text span by span, and the
text inside blocks — and what it would become. It leaves alone what is not
text: slugs, ids, relations, media references, marks and link hrefs.

`@cogenta/api` gains `POST /api/content/-/replace`, a preview unless `apply` is
sent. It searches only collections the actor may edit, applies through the
store's ordinary update (new version, reindex, content events), re-reads each
entry at the moment of writing so one edited in between is left alone, and says
when a preview stopped early.

`cogenta serve` records every entry an applied replacement wrote in the audit
log, with the phrase and its replacement. It also now records a visibility
change (`content.visibility`), which fell through unrecorded since `schema@2.2`.
