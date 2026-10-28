---
'@cogenta/schema': patch
---

An id that is not shaped like one the store mints is now "not found" on every database, without a query. `GET /api/content/post/xx` answered a 500 `DB_UNREACHABLE` on Postgres (the `uuid` column refuses the cast) and a 404 elsewhere; the content, taxonomy and menu stores, a `translationOf` or to-one relation filter, and a forged pagination cursor now behave the same on all three.
