# @cogenta/commerce

## 0.3.0

### Minor Changes

- 0c7ecef: Audit A1-commerce (P2) — open carts nobody touches are now actually marked
  abandoned, automatically.
  
  `CartStore.abandon()` has existed since fiche 32 with no automatic caller: a shop's
  open carts stayed `status: 'open'` forever, even weeks after a shopper vanished.
  `CartStore` gains a new method, `abandonInactive(options?: { olderThanMs?: number })`
  (default 24h, `DEFAULT_CART_ABANDON_MS`, also exported), which marks every open cart
  past its staleness threshold abandoned in one guarded `UPDATE` — idempotent on its own,
  same discipline as this package's other bulk sweeps.
  
  `cogenta serve` schedules it as a new `commerce-carts` task (hourly by default,
  `cartAbandonTickMs`/`cartAbandonAfterMs` test seams), always registered — like
  `commerce-subscriptions`, it needs no e-mail transport, only this site's own
  unconditionally-created commerce tables.
  
  No breaking change: `abandonInactive` is a new, additive method on `CartStore`.
- ca9d74c: Catalogue back office, brought up to what `CatalogStore` already supported but the
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
- 322d1a3: Fiche 52 — Cogenta Commerce: orders and customers, the trailing gap this
  audit's own opening line named ("le modèle de commande n'a aucune adresse
  postale structurée"). **Contains a breaking change**, called out below —
  contract E is deliberately not yet frozen (ADR-0024), so this ships as
  `minor` rather than `major` per this project's existing pre-alpha practice
  (see the taxonomies/trash changesets), with the break stated plainly here.
  
  **Breaking**: `POST /api/commerce/payments/{id}/refund` now requires a
  non-empty `reason` in the request body ("motif obligatoire" — task 6) and
  answers `{ refund, creditNote }` instead of the bare refund record. A caller
  sending no reason now gets `400 COMMERCE_AMOUNT_INVALID` instead of a
  refund with no stated cause.
  
  `@cogenta/commerce`:
  - `Order` gains six structured shipping-address fields
    (`shippingAddressLine1/2`, `shippingCity`, `shippingPostalCode`,
    `shippingRecipient`, `shippingPhone`) and four shipment-tracking fields
    (`trackingCarrier`, `trackingNumber`, `trackingUrl`, `shippedAt`) — all
    nullable, added in place to `cogenta_commerce_orders` on an
    already-deployed site (idempotent `alter table`, same idiom as
    `menu-tables.ts`'s `location` column; no down path exists or is needed for
    an additive nullable column).
  - `OrderStore` gains `placeManual` (a shopkeeper-entered order — phone,
    trade-show, correction — that opens a real cart and calls `place()`
    internally, never a second placement path), `update` (corrects the e-mail
    and/or address while `pending`; refuses with `COMMERCE_ORDER_LOCKED` once
    paid) and `setTracking` (attaches carrier/number/url; moving a `paid`
    order to `shipped` is a side effect of attaching tracking, not a separate
    step). `OrderListOptions` gains `placedFrom`/`placedTo`.
  - New module `order/notify.ts`: `createOrderEmailQueue`, a persisted,
    retried (`MAX_ATTEMPTS = 5`) transactional e-mail queue built on
    `@cogenta/channels`'s existing `createEmailAdapter` — never a second
    transport. A new direct dependency on `@cogenta/channels` follows (R9:
    reuse over reinvention, same package this project already depends on
    elsewhere).
  - New module `order/csv.ts`: `ordersToCsv`, an RFC 4180 accounting export,
    zero dependency (R9) — one row per order (reference, date, status, email,
    the four summed figures, invoice number when one exists). Decision this
    fiche had to make and is documenting here: row-per-order rather than
    row-per-line, matching the fiche's own singular "export comptable" wording.
  - `CustomerStore` gains `anonymize` (GDPR erasure of the customer record —
    email/name only; an order's own historical copy of the email is
    deliberately retained as a financial record).
  - New module `invoice/credit-note.ts`: `createCreditNoteStore`, one credit
    note per refund (its own `CN-2026` series, sharing the same
    compare-and-set sequence table as invoices via the newly extracted
    `invoice/sequence.ts`) — issued automatically by the refund route once
    billing is configured, never a second manual step.
  - `CommerceAdminRouter` gains routes: `POST/GET/PATCH /orders`,
    `PUT /orders/{id}/tracking`, `GET /orders/{id}/emails`,
    `GET /orders/{id}/credit-notes`, `GET /orders/export.csv`,
    `GET /payments/{id}/refunds`, `GET/POST /customers/{id}`,
    `POST /customers/{id}/export`, `POST /customers/{id}/anonymize`.
    `CommerceResponse.body` can now also be a plain `string` (the CSV export),
    alongside the existing JSON/`Uint8Array` shapes.
  - `@cogenta/core` gains four error codes: `COMMERCE_CUSTOMER_NOT_FOUND`,
    `COMMERCE_ORDER_LOCKED`, `COMMERCE_TRACKING_INVALID`,
    `COMMERCE_CREDIT_NOTE_NOT_FOUND`.
  
  `@cogenta/cli` wires all of the above into `cogenta serve`: the order-email
  queue (built whenever an e-mail transport is configured — always, in
  practice, since `runServe` builds the degraded `FileEmailTransport`
  unconditionally) and the credit-note store (built whenever `billing` is
  configured, the same gate invoicing already uses) are passed to
  `createCommerceAdminRouter`; a new scheduled task, `commerce-order-emails`
  (`COMMERCE_EMAIL_TICK_MS = 60_000`, overridable via `commerceEmailTickMs`
  for tests), flushes the retry queue — and is correctly folded into the
  scheduler's own heartbeat interval calculation, a real bug this fiche found
  and fixed (the heartbeat previously only ran as often as the *slowest* of
  the other seven tasks needed, so a fast test override on this one alone
  would never actually fire). The transport layer gains a `text/csv` branch
  alongside the existing JSON/PDF ones.
- 2211d4b: `GET /api/commerce/permissions` — a read-only route answering contract E's own
  permission vocabulary (`COMMERCE_PERMISSIONS`) and which roles this site actually grants
  each one. Needs `commerce.read`, the same as every other read route.
  
  `CommercePermissionLayer` gains a `roles` field: the resolved role→permissions map this
  layer is actually enforcing (`DEFAULT_COMMERCE_ROLES` unless `CommercePermissionOptions.roles`
  overrode it). A structural, additive change to the interface — every existing
  `createCommercePermissions()` caller still compiles and behaves identically; only a
  caller that builds its own object literal satisfying `CommercePermissionLayer` by hand
  (none does in this codebase) would need to add the field.
  
  Both exist so fiche 19's admin permission matrix can render what this layer really
  enforces instead of a copy of `DEFAULT_COMMERCE_ROLES` hand-typed into the admin bundle,
  which would silently go stale the day a site passes `roles` to override the defaults.
- c476861: A product and its variants can now carry photos directly on the commercial record,
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
- bebbab8: Add store settings for the shop (fiche 34): tax zones/rates with a simulator, shipping
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
- 1dd9e6f: Fiche 53 — coupon per-customer/product limits and a real dunning machine for failed
  subscription renewals, plus the admin screen work pause/resume/billing-history already
  had server-side support for.
  
  **Coupons.** `Coupon`/`CreateCouponInput` gain `maxRedemptionsPerCustomer` (on top of,
  never instead of, the existing global `maxRedemptions`) and `restrictedProductIds`
  (commerce product ids; empty means unrestricted). `CouponStore.check()` takes an
  optional fourth `context: { customerId?, productIds? }` argument — existing three-argument
  callers are unaffected — and `CouponCheck` gains two new cases, `customer_exhausted` and
  `not_applicable`; a switch over `CouponCheck.kind` that was exhaustive before this change
  needs a case for both (a real, structural addition to an existing union, called out here
  rather than silently shipped as a patch). `CouponStore.redeem()` now also claims the
  per-customer counter atomically, in the same transaction as the existing global one — a
  customer who loses their own limit's race never burns a global redemption meant for
  someone else. Two new error codes: `COMMERCE_COUPON_CUSTOMER_EXHAUSTED`,
  `COMMERCE_COUPON_NOT_APPLICABLE`. `CouponStore` gains `metrics()`.
  
  **Subscriptions — dunning.** `SUBSCRIPTION_STATUSES` gains `past_due` — another
  structural union widening, same caveat as above for an exhaustive switch. A subscription
  lands there the instant a renewal payment fails, and `runBilling`'s own due-query
  (`status = 'active'`) skips it until the cycle resolves. `SubscriptionStore` gains
  `dunning(id)` and `runDunning(options?)`: three retries at 1/3/7 days after the first
  failure by default (the fiche's own proposed calendar, documented as
  `DEFAULT_DUNNING_SCHEDULE_DAYS`, configurable per store via the new
  `SubscriptionStoreOptions.dunningScheduleDays`) — a subscription is never auto-suspended
  before the schedule is exhausted, and `runDunning` replayed on an already-attempted due
  date is a no-op (a compare-and-set on `next_retry_at`, mirroring the scheduler lock in
  `@cogenta/schema`). `pause()`/`resume()`/`cancel()` now also clear an open dunning cycle.
  
  **Subscriptions — plan changes.** `SubscriptionStore.changePlan(id, newVariantId,
  options?)` switches the plan immediately with an explicit prorated charge for the rest
  of the current period; a downgrade's credit is reported (`prorationMinor` negative) but
  never silently issued — this store has no credit-note mechanism.
  
  **Subscriptions — renewal notices and metrics.** `SubscriptionStoreDependencies` gains
  an optional `notifyRenewal`; `sendRenewalNotices()` is a safe no-op without it (R2). A
  ready-made notifier, `createEmailRenewalNotifier`, is built on `@cogenta/channels`'s own
  `EmailTransport`/`renderEmailMessage` (`@cogenta/commerce` gains a real dependency on
  `@cogenta/channels`) — never a second email renderer. `SubscriptionStore` gains
  `metrics()` (active/past-due/paused/cancelled counts, MRR, churn).
  
  **Admin router.** `GET /api/commerce/coupons/metrics`, `GET
  /api/commerce/subscriptions/metrics`, `GET /api/commerce/subscriptions/{id}` (the
  subscription plus its billing history and open dunning cycle), and `POST
  /api/commerce/subscriptions/{id}/change-plan`.
- 8a8d873: Add PayPal as a third, independently registered payment driver — proof that the payment
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
- 8a8d873: Fiche 54 tasks 1 and 2.
  
  - `SHIPPING_KINDS` gains `pickup` (additive, mineure) alongside `flat`/`by_weight`/`free`:
    a customer can now collect an order in person. `storedRate` prices it at zero, the same
    line `free` already returns — no new branch anywhere else, so the simulator
    (`POST /shipping/simulate`) and the real cart price (`CartStore.price`, via
    `ShippingStore.quote`) stay the same code they already were, proven by a test that
    places a real order with a pickup method and checks its computed `shippingMinor` against
    what the simulator shows for the same subtotal.
  - `InvoiceStore` gains `preview(orderId)`: a real invoice PDF for any existing order,
    issued or not, built from the exact same `documentFor`/`pdfDocumentFor`/
    `renderInvoicePdf` chain `issue()` + `pdf()` use — never a second, drifting
    implementation of what an invoice looks like. It writes no row, records no order event,
    and — the property that actually matters — never claims a number from the gapless
    invoice sequence (`"PREVIEW"` fills the number field instead), so a shop owner can
    reload it as many times as they like while checking the seller details or the template
    without spending a real, legally-meaningful invoice number. `@cogenta/commerce`'s admin
    router gains `GET /orders/{id}/invoice/preview` (`commerce.read`, same bar as the tax
    and shipping simulators — nothing here is a write).
  - `@cogenta/admin` (private, no changeset): the shipping-method form offers "Local pickup"
    and hides the amount field for it, and the store-settings screen's invoice card gets a
    real, working preview — an order-id field and a button that opens a live-rendered PDF in
    a new tab — replacing the "open an already-invoiced order instead" placeholder text.
  
  Also noted, out of this task's scope: `commerce.invoiceSeriesPrefix` and
  `commerce.invoicePaymentTerms` — two editorial settings this same screen already exposes
  as editable — have no effect on a real, issued invoice today (`issue()`'s `series`
  defaults to the current year, never the configured prefix, and there is no
  `paymentTerms`/`language` field anywhere in `InvoiceDocument`/`PdfInvoiceDocument`). The
  new preview deliberately shows what issuing an invoice *actually* produces right now
  rather than a preview of settings with no effect, which would have been misleading. Wiring
  those settings into real invoicing is a separate, pre-existing gap, flagged here rather
  than fixed silently as part of an unrelated task.

### Patch Changes

- 39807ed: Audit T-COM-03 (P1) — the accounting CSV export now honours the same
  reference/e-mail search (`q`) `GET /orders` already filtered by.
  
  `GET /orders/export.csv` gains the same `q` query parameter `GET /orders` has had
  since fiche 52 task 7 (`OrderListOptions.search`, unchanged) — a search that narrowed
  the order list on screen to a handful of matches used to export every order in the
  shop regardless, since the export route never read `q` at all. No new field, no
  contract change: `OrderStore.list({ search })` already existed and is only reused
  here a second time.
- e75b23e: Add global search: the ⌘K/Ctrl+K palette with shortcuts and "go to"/"create" actions, a full `/search?q=…` results page, highlighted excerpts, widened sources (orders, media, users, menus, extensions, taxonomy terms), typed inline filters (`status:draft`) and recent-search history (fiche 36).
  
  - `@cogenta/schema`'s search indexing (`extract.ts`) gains `buildExcerpt` — a window of prose
    around the first query term found, with match offsets scoped to that window, never the
    full text. Built from the *display* text (`SearchDocument.body`, never folded), so an
    excerpt keeps real casing and accents while still matching a folded, prefix-matching
    query.
  - `@cogenta/api`'s `search-router.ts` enriches each `SearchHit` with an excerpt built
    server-side, never reconstructed from HTML on the client (R3/R8: the excerpt is data,
    escaped at render).
  - `@cogenta/commerce`'s order store and admin router gain a search-by-number/email lookup,
    gated on the caller's own `commerce.read` permission — a source in the global search
    widens only what its own permission already allows, never more.
  - Admin: `shell/global-search.tsx` (palette, shortcuts, recent searches, inline-filter
    parsing), `routes/search.tsx` (the full results page, one tab per source with its own
    permission gate), `search/` (excerpt highlighting, inline-filter parser, recent-search
    `localStorage` store — never server-side, these are one person's own queries).
- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [0e88f30]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [4d3f3c7]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [2285720]
- Updated dependencies [46572ba]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [07c0f0a]
  - @cogenta/core@0.5.0
  - @cogenta/channels@0.3.0

## 0.2.0

### Minor Changes

- [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Completes the admin surface of contract E (ADR-0024) beyond its MVP: multiple
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

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0

## 0.1.0

### Minor Changes

- [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - E-commerce (L15), as a new package `@cogenta/commerce` on a **new contract E**
  rather than an extension of contract A.
  
  The decision is proposed in `ADR-DRAFT-commerce.md` at the repo root and is
  **not yet acted** — it needs a human to accept it before it goes into
  `docs/03-decisions.md`. The implementation assumes it. In one line: three of
  contract A's own decisions make an order a bad content entry. ADR-0014 would
  fork one order per language; ADR-0022 has just made every content entry
  restorable from the trash, and an order is not; and versioning drafts have no
  meaning for a sale. The product's *editorial* face stays firmly in contract A
  through an optional `contentRef`, so a catalogue keeps rich text, blocks, SEO,
  translations and scheduling for free. Contract A does not move: it stays at
  `schema@2.0`, and a site that sells nothing never creates a commerce table.
  
  **Money is an integer of minor units, everywhere.** The three mandatory
  dialects do not agree on decimals — SQLite has only `REAL`, a binary float — so
  a decimal column would mean something subtly different on one of the three
  supported databases. Rates are basis points for the same reason. Amounts are
  `bigint` columns, and every read goes through a decoder, because `pg` hands
  `int8` back as a *string*: a price read as `"1999"` and added to another is
  `"19991999"`, a bug that would appear only on Postgres and only in production.
  
  **Stock cannot go negative.** `takeStock` runs one immediate transaction and
  lowers each line with `update … set on_hand = on_hand - n where id = ? and
  on_hand >= n`, reading `rowsAffected` — the same idiom that makes a password
  reset token single use. Repeated variants in one basket are summed first, or
  two lines of two would each pass against a stock of three. The concurrency test
  is a real race against a SQLite *file* with two independent connections
  (`:memory:` gives two unrelated databases and would prove nothing), and it
  carries a control that re-implements the naive read-then-write and asserts it
  *does* oversell.
  
  **Placing an order is one transaction**: stock taken, coupon redemption
  claimed, order and lines written, cart closed, first history event recorded.
  Any failure and none of it happened.
  
  **Payment is interface plus two implementations**, like cache, queue and
  storage (R1). Stripe is `optimal`, written against the REST API with `fetch`
  and no `stripe` dependency, with real webhook signature verification
  (timing-safe, every `v1` candidate, 5-minute freshness window). Bank transfer
  is `degraded` and is **not a stub** — plenty of businesses are paid that way
  and nothing else; the difference is who confirms the money arrived. The whole
  checkout, the whole subscription biller and the whole invoice path are tested
  end to end with no API key, URL or network configured anywhere (R2).
  
  **Invoice numbers are gapless and never reused**, claimed by a compare-and-set
  inside the transaction that writes the invoice, so a rolled-back invoice does
  not burn a number and two invoices issued in the same millisecond get
  consecutive ones. A `count(*) + 1` would hand out duplicates under any
  concurrency and re-issue a number a deleted row used to hold. The PDF is
  generated with zero dependencies (R9/R10) and is deterministic: the same
  invoice regenerated years later is byte-identical, because it renders from a
  frozen snapshot and never reads a clock.
  
  Also: tax rules resolved by specificity rather than insertion order; shipping
  methods with an optional carrier driver that falls back to the stored rate when
  the courier's API is down; coupons with three kinds and a redemption count
  claimed the same way stock is; subscriptions whose month arithmetic puts 31
  January + 1 month on 28 February rather than 3 March, and which bill through
  the same orders, payments and invoices as everything else.
  
  `@cogenta/core` gains the `COMMERCE_*` error codes (a minor bump: adding a code
  is additive, and nothing existing changed meaning).
  
  **Not in this release**, and deliberately so: no admin React screens (the
  back office is a transport-free router with its own permission vocabulary,
  tested by role — the UI belongs with L11's design system), no storefront
  blocks, and no Stripe integration test against a real sandbox (it is written
  and skips loudly without `COGENTA_TEST_STRIPE_SECRET_KEY`).

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
