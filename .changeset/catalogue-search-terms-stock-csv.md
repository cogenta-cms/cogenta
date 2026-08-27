---
'@cogenta/commerce': minor
---

Catalogue back office, brought up to what `CatalogStore` already supported but the
admin screen and router never exposed (fiche 51).

**Task 1 — the editorial link.** `contentRef` can now be set and cleared through
`PATCH /products/:id` (it was write-only in code but never actually reachable from the
router), and `readProductByContentRef(collection, entryId)` answers the reverse
question — the content editor's own cross-link to a linked product's commercial
record. Nothing about `ContentRef` itself changes: it stays the deliberate non-foreign-key
pair it always was.

**Task 2 — search, sort, pagination.** `ProductListOptions` gains `sort`
(`createdAt`/`title`/`handle`) and `direction`; `GET /products` answers
`{ products, hasMore }` (one row fetched past the requested `limit`, the same technique
`media-client.ts`'s cursor pagination already uses, adapted to this offset-based list).

**Task 3 — classification.** A product can now carry terms of any taxonomy the site
declares (ADR-0022) through a new join table, `cogenta_commerce_product_terms` — never a
foreign key into a term table this package cannot know the name of, same reasoning as
`content_ref`. Governed by `commerce.catalog.write`, not contract A's `canTerm`:
categorising a product is catalogue work, and the two permission layers stay
deliberately uncoupled. `CatalogStore.listProductTerms`/`setProductTerms` (replace the
whole set for one taxonomy, never append), `PUT /products/:id/terms`.

**Task 4 — low stock and stock history.** `lowStockThreshold` on a variant;
`CatalogStore.listLowStock()` and the new `GET /variants/low-stock`. Every write that
moves `on_hand` (`setStock`/`restock`/`takeStock`) now also appends one row to a new,
append-only `cogenta_commerce_stock_movements` table — `listStockMovements`/
`GET /variants/:id/stock-movements` — recording delta, resulting balance, reason
(`sale`/`restock`/`stock_take`/`manual`) and, when the caller supplies it, an actor and a
reference (an order id, typically). The concurrency-safe write path
(`on_hand = on_hand - :n where on_hand >= :n`) is untouched; the movement is written
inside the same transaction, so a shortfall that rolls a sale back rolls its movement
row back with it — proven by a real two-connection SQLite-file test, not asserted.

**Task 5 — promotion and dimensions.** `compareAtPriceMinor`/`saleStartsAt`/`saleEndsAt`
(the pure `isOnSale()` helper resolves whether a promotion is active right now, open
start/end both meaning "always" rather than "never") and `widthMm`/`heightMm`/`depthMm`,
all nullable and independently clearable (`null` clears, `undefined` leaves alone —
tested).

**Task 6 — CSV import/export.** `exportProductsCsv`/`previewProductsImport`/
`applyProductsImport` — a hand-written, zero-dependency reader/writer (R9) matching
`@cogenta/api`'s redirect-import CSV feature: header row matched by name,
case-insensitively, in any order, and a strict preview-then-apply split (`POST
/products/import`, `apply: true` only on the second, explicit call). One row is one
variant; a product is looked up or created by `handle`.

All additive: no existing route, field or table changes shape. New columns on
`variants` and two new tables are added the same way `menu-tables.ts`'s own
in-place growth already works (`alter table add column`, swallowed once already
present). Tested against SQLite (three real SQLite-file connections for the stock
concurrency extension); Postgres/MySQL/MariaDB are wired into the same contract suite
that already runs them but were not executed this session (Docker unavailable).
