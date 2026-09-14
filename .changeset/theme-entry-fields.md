---
'@cogenta/theme-kit': minor
'@cogenta/cli': minor
---

**Contract D `theme@1.5`: an entry page can show the entry's own fields.**
`PageEntryMeta` gains an optional `fields` record carrying the entry's plain
values (text, slug, number, boolean, date, datetime, select, color), so a
product page can finally print its price and whether it is in stock, and a
dish its price. Rich text, media, relations and blocks are never included.
Strictly additive: a `theme@1.4` theme ignores the field and renders exactly
as before.
