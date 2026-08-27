---
"@cogenta/core": minor
"@cogenta/commerce": minor
"@cogenta/cli": minor
---

Fiche 52 — Cogenta Commerce: orders and customers, the trailing gap this
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
