---
'@cogenta/commerce': minor
---

A product and its variants can now carry photos directly on the commercial record,
rather than only reachable through `contentRef`'s linked content entry — a merchant
with no editorial entry linked still needs a picture to sell anything.

`Product` gains `imageMediaIds: readonly string[]` (media library ids, in display
order — the first is the cover shown in admin lists and order lines), settable through
`CreateProductInput`/`UpdateProductInput` and `POST /products`/`PATCH /products/:id`.
`Variant` gains `imageMediaId: string | null` (one photo per variant — a colour, a
size — never a list), likewise through `CreateVariantInput`/`UpdateVariantInput` and
`POST /products/:id/variants`/`PATCH /variants/:id`.

Both are opaque media ids, the same convention `contentRef` already set: this package
does not depend on the media store and never validates that an id actually exists,
only that the admin's own picker did. `image_media_ids` is a JSON-encoded array stored
as `text` (no dialect gives an array column the same meaning on all three, ADR-0006);
`image_media_id` is a plain nullable column, same shape as every other single-value
variant field. Both are added the same idempotent, in-place way `tables.ts`'s
`ensureColumns` already grows `variants` (`alter table add column`, swallowed once
already present) — no migration, no version bump to the table's own shape.

Additive throughout: no existing field, route or table changes shape.
