---
"@cogenta/commerce": patch
---

Audit T-COM-03 (P1) — the accounting CSV export now honours the same
reference/e-mail search (`q`) `GET /orders` already filtered by.

`GET /orders/export.csv` gains the same `q` query parameter `GET /orders` has had
since fiche 52 task 7 (`OrderListOptions.search`, unchanged) — a search that narrowed
the order list on screen to a handful of matches used to export every order in the
shop regardless, since the export route never read `q` at all. No new field, no
contract change: `OrderStore.list({ search })` already existed and is only reused
here a second time.
