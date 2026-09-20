---
'@cogenta/starters': patch
---

Stop writing English field labels into the schemas the blueprints scaffold.

Nine fields — `topic`, `kicker`, `discipline`, `icon`, `orderLink` and the
four SEO ones — shipped an English `admin.label` and `admin.help`, so a French
site's entry form read "Topic", "SEO title", "Hide from search engines". The
admin names them instead, in whichever language the person looking at them
chose (ADR-0019 makes that a preference of the person, which a label written
into a schema file at scaffold time cannot follow).

Four labels stay, deliberately: a portfolio's `summary` is a **Statement** and
a SaaS feature's `coverImage` is a **Screenshot**. There the blueprint is not
repeating what the field is, it is giving a generic field its own word, and a
dictionary keyed by field name would flatten it.

A site already scaffolded keeps the labels in its own `cogenta.schema.*`,
which is still the first thing the admin reads. Nothing changes for it unless
those lines are removed by hand.
