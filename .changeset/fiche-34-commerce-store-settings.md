---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/commerce': minor
'@cogenta/cli': minor
---

Add store settings for the shop (fiche 34): tax zones/rates with a simulator, shipping
zones/methods with a simulator, payment driver activation (presence-only for keys, never
values), general store settings, and a configurable invoice template.

- `@cogenta/core` gains a `payment` configuration section (`driver`, `testMode`,
  `manualInstructions`) following the exact `llm`/`billing` pattern: the Stripe secret key
  and webhook secret are never declared in the schema and are refused with
  `CONFIG_SECRET_IN_FILE` if written to `cogenta.config.mjs` — they come only from
  `COGENTA_PAYMENT_STRIPE_SECRET_KEY`/`COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET`.
- `@cogenta/schema`'s site-settings registry (fiche 23) gains a `commerce` group
  (currency, tax-inclusive/exclusive display, countries served, minimum order, default
  backorder policy, ToS/return-policy page paths — pointers to real content entries, not
  text fields — and invoice series prefix/payment terms/language) and a new `select`
  `uiType` for closed-choice settings.
- `@cogenta/commerce`'s admin router gains `GET|POST /tax/rules`, `DELETE
  /tax/rules/{id}`, `POST /tax/simulate` (calls the real resolver, never a second
  implementation), the shipping equivalents (`/shipping/methods`, `/shipping/simulate`),
  and `GET /payment/drivers` / `POST /payment/drivers/{name}/test-connection` (presence
  and live health only, never a key's value). `CommerceAdminRouterOptions` gains required
  `tax`/`shipping` fields and an optional `payment` field — **a breaking change** for any
  direct caller of `createCommerceAdminRouter` that does not yet pass them.
- `@cogenta/cli`'s `cogenta serve` now selects a real payment gateway through
  `createPaymentRegistry` (Stripe when a key is configured and reachable, bank transfer
  otherwise) instead of a hardcoded manual gateway, and mounts the new commerce settings
  routes.
- `@cogenta/admin` (private, no changeset) gains four screens under "Boutique": Tax,
  Shipping, Payment, and Store settings (general + invoice template), all `admin`-only.

Deliberately not built in this fiche: an inbound `POST /api/commerce/payments/webhook`
route. `PaymentStore.handleWebhook` is already implemented and tested; wiring it needs
the raw (non-JSON-parsed) request body, which `cogenta serve`'s shared body reader does
not yet support for any route. The payment screen shows the webhook URL a deployer would
configure at Stripe, honestly labelled as not yet receiving events. See `BLOCKERS.md` §15.
