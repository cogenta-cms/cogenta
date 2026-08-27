---
'@cogenta/commerce': minor
---

Fiche 54 tasks 1 and 2.

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
