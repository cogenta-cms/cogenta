---
'@cogenta/cli': minor
---

Back up every table of the site, not a quarter of them.

`cogenta backup create` archived 25 tables out of roughly a hundred. Missing from every
backup — and therefore from every restore — were the active theme, the site settings,
installed plugins and their capability grants, comments, forms and their submissions,
role permissions, analytics, and all 24 `cogenta_commerce_*` tables: orders, invoices,
payments. The command's own help promised "every table … and, when the site sells
anything, commerce". Proven by restoring into an empty project and diffing the two
databases: 75 tables present in the source were absent from the target.

What made it possible is the real fix. The list of tables outside the content schema was
hand-maintained in one call site, and nothing checked it against the site it was meant to
describe, so a table added anywhere in the product was simply forgotten. There is now a
declared exclusion map, each entry carrying the reason that table is *deliberately* not
backed up — a derived search index, a queue's in-flight work, a scheduler lease, an
oEmbed cache, the rotating analytics salt — and a test that walks the real tables of a
real served site and fails on any table that is neither backed up nor named there.
Adding a table and forgetting it is now a failing test.

This matters beyond `backup`: `update apply` takes a restore point with this command
before it changes anything, so until now that safety net was carrying a quarter of the
site.
