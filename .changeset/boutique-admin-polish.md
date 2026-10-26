---
"@cogenta/commerce": patch
"@cogenta/schema": patch
"@cogenta/cli": patch
---

Shop (Boutique) polish (2026-10-21).

- `@cogenta/commerce`: variant search by name/SKU (`GET /variants/search`), manual orders with country, delivery method, coupon and recorded payment (a refused order creates no customer), recurring variants (`recurring`) that open a subscription when the order is paid (`createFromOrder`, `openFromPaidOrders`), manual subscription creation, coupon edit/activate/delete, per-customer limits, partial refunds only against a collected payment, tracking URL validation, 409 (never a raw SQL 500) for every UNIQUE conflict, invoice seller and template resolved from the shop settings at issue time (`SellerSource`).
- `@cogenta/schema`: new shop settings `commerce.sellerLegalName`, `commerce.sellerAddress`, `commerce.sellerTaxId`, `commerce.sellerFooter`; `commerce.invoiceLanguage` is now `fr` or `en` (default `fr`).
- `@cogenta/cli`: invoices and credit notes read the seller from the shop settings (falling back to `billing`); the subscription tick opens subscriptions for orders paid online.
