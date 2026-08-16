---
'@cogenta/commerce': minor
'@cogenta/core': minor
'@cogenta/cli': minor
---

Completes the admin surface of contract E (ADR-0024) beyond its MVP: multiple
variants per product, coupons, invoices and subscriptions are now all
reachable from a real HTTP admin, not just the backend that already carried
them.

`@cogenta/commerce`'s `createCommerceAdminRouter` gains: `DELETE
/variants/{id}` (a product's variant list was previously append-only from the
admin's point of view); `GET`/`POST /coupons` and `POST
/coupons/{code}/deactivate`; `GET`/`POST /subscriptions` and the
`pause`/`resume`/`cancel` actions (absent when the caller does not wire a
`SubscriptionStore` — a site with no `commerceSubscriptions` store answers
404, never a crash); and `GET /orders/{id}/invoice` plus `GET
/orders/{id}/invoice/pdf`, the read side of an invoice-issuing route that
existed but could previously only be written to, never read back. The PDF
route answers with a raw `Uint8Array` body — the one response in this router
that is not JSON — and the Node transport (`cogenta serve`) now checks for
that shape before deciding whether to `JSON.stringify` or stream bytes with
`content-type: application/pdf`.

`@cogenta/core` gains an optional `billing` config section (legal name,
address, tax id, footer) — nothing here is a secret, rule R7 does not apply,
a legal name is meant to be printed. Its absence is a real, first-class state:
`cogenta serve` only builds an `InvoiceStore` and only accepts `POST
/orders/{id}/invoice` once a site has filled this in, because an invoice with
a made-up seller address is worse than no invoicing feature at all.

`@cogenta/cli` wires `createSubscriptionStore` and the conditional
`createInvoiceStore` into `assembleSite`, passes `coupons`/`subscriptions`/
`invoices` into the admin router (previously only `catalog`/`orders`/
`customers`/`payments` were threaded through, silently dropping the coupon
store `cogenta serve` already built), and adds the PDF passthrough above.

The admin (`@cogenta/admin`, private, no changeset) gets the screens this
backend work makes possible: a real variant list per product (add, edit,
remove, price and stock each independently, `commerce.catalog.write`-gated)
replacing the one-variant-per-product MVP; `/commerce/coupons` (create by
code/kind/value/validity window/redemption limit, deactivate); `/commerce/
subscriptions` (list by status, cancel — creation is deliberately absent,
since a subscription is created at checkout, not from the back office); and
an "issue invoice" / download-PDF pair on the order detail screen. All money
is entered and displayed through the existing `commerce/money.ts` conversion
at the edges — every request on the wire still carries `priceMinor`, never a
float.

Proven end to end in `packages/cli/test/serve-commerce.test.ts`, against a
real HTTP server and a real SQLite file: a second variant added and removed
through the router; a coupon created, listed and deactivated, and refused for
a role with only `commerce.read`; a paid order invoiced, the invoice read
back by the same route the admin polls, and its PDF downloaded and checked
for the format's own magic bytes (`%PDF-`) rather than merely a 200 status; a
site with no `billing` configured answering `COMMERCE_INVOICE_NOT_FOUND`
instead of issuing a document with a fabricated seller address; and a
subscription seeded the way checkout would seed one, listed and cancelled
through the real admin API.
