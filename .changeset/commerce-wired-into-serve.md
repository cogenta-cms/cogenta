---
'@cogenta/cli': minor
---

`cogenta serve` now mounts contract E's back office at `/api/commerce/*`.

`@cogenta/commerce` had a complete, tested backend (products, variants, stock,
carts, orders, payments, coupons, taxes, shipping) since L15, but its router
was never actually reachable from a running site — the same "written, tested,
never called" gap L10 closed for search, SEO, images and security. This
closes it for commerce: `ensureCommerceTables` runs once at startup (a site
that sells nothing pays only for a handful of idempotent `create table if not
exists` statements it never queries), the catalogue/customer/order/payment
stores are built the same way the taxonomy stores already are, and
`createCommerceAdminRouter` is gated by contract E's own permission
vocabulary (`commerce.read`, `commerce.catalog.write`, `commerce.order.write`,
`commerce.payment.settle`, `commerce.order.refund`, `commerce.invoice.issue`)
— never contract A's five actions, which do not stretch to "refund an order".

The payment gateway wired in today is the manual/bank-transfer driver only
(no provider keys required, so a shop is sellable out of the box); a site
that wants Stripe configures it itself once `@cogenta/commerce`'s driver
registry grows a way to do so from `cogenta.config`. Invoicing is not mounted
yet — it needs seller details this file has no source for.

Proven end to end in `packages/cli/test/serve-commerce.test.ts`: a real HTTP
server, a real SQLite file, a real session — a product and its variant
created through `/api/commerce` are immediately listable and carry the stock
and price the write set.
