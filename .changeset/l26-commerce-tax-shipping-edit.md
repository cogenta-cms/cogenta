---
'@cogenta/core': minor
'@cogenta/commerce': minor
---

A tax rule or shipping method could previously only be created or deleted — fixing a typo'd rate, label, or zone meant deleting and recreating it, losing its `createdAt` and (for a shipping method) its `position` among the other methods.

- `TaxStore.updateRule()` and `ShippingStore.updateMethod()` (`@cogenta/commerce`) accept a tri-state patch: a field absent from the patch is left exactly as saved, and for the nullable fields (`country`/`region`/`freeOverMinor`/`carrier`) an explicit `null` clears them back to what an absent field already means at creation time.
- `PATCH /api/commerce/tax/rules/:id` and `PATCH /api/commerce/shipping/methods/:id` carry the same semantics — still gated on `commerce.catalog.write`, unchanged authorization.
- `@cogenta/core` gains the `COMMERCE_TAX_RULE_UNKNOWN` error code for an edit naming an id that was never a rule (shipping reuses the existing `COMMERCE_SHIPPING_METHOD_UNKNOWN`).
- Admin: an "Edit" action on each tax rule and shipping method row opens a dialog — pre-filled from the row — that saves through this PATCH path.
