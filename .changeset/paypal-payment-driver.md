---
'@cogenta/core': minor
'@cogenta/commerce': minor
'@cogenta/cli': minor
---

Add PayPal as a third, independently registered payment driver — proof that the payment
gateway a shop uses is not a fixed Stripe/bank-transfer pair but an open registry
(`@cogenta/commerce`'s `PaymentGateway` interface, the same `Driver<T, Config>` shape as
cache/queue/storage), the concrete answer to "what if I don't want Stripe?".

- `@cogenta/commerce` gains `payment/paypal.ts` (`paypalPaymentDriver`), written against
  PayPal's REST Orders v2 / Payments v2 API with `fetch`, no new dependency (R9), the same
  discipline as `payment/stripe.ts`: OAuth2 client-credentials token caching, a real
  RSA-SHA256 webhook signature check against a certificate fetched from
  `paypal-cert-url` (trusted only when its origin matches `apiBaseUrl` or is a genuine
  `*.paypal.com` host — a forged cert-url header cannot "verify" against its own key), a
  freshness window, and an explicit event whitelist so an unrecognised PayPal event is
  refused rather than guessed as `paid`. `fetch()` captures an order the moment it sees
  `APPROVED` (there is no separate capture verb in this project's narrow
  `PaymentGateway` interface), tolerating the one real race a concurrent poll can hit
  (`ORDER_ALREADY_CAPTURED`) by re-reading the order instead of failing. Registered in
  `payment/registry.ts` alongside Stripe (both `optimal`) ahead of the always-available
  `manual` driver (`degraded`).
- `@cogenta/core`'s `payment` configuration section gains `paypal` as a named driver and
  three secret fields (`paypalClientId`, `paypalClientSecret`, `paypalWebhookId`), refused
  in `cogenta.config.mjs` the same way Stripe's are and sourced only from
  `COGENTA_PAYMENT_PAYPAL_CLIENT_ID` / `COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET` /
  `COGENTA_PAYMENT_PAYPAL_WEBHOOK_ID`.
- `@cogenta/cli`'s `cogenta serve` passes the three PayPal fields through to
  `createPaymentRegistry` alongside the existing Stripe ones — no other wiring changed.
- `@cogenta/admin` (private, no changeset): the payment screen is rebuilt from a
  two-card grid into a real provider list (WooCommerce's "Payment providers" pattern) —
  each row shows tier, configured/not-configured, active, and its own test-connection
  button — so a third driver appears with no change to the component, proving the point
  visually rather than only in code.

PayPal's sandbox and live environments are different hostnames (`api-m.sandbox.paypal.com`
vs `api-m.paypal.com`), unlike Stripe's single host with a test/live key prefix — an
operator testing against the sandbox sets `payment.apiBaseUrl` explicitly, the same escape
hatch the driver's own test suite uses to point at a local HTTP stub.
