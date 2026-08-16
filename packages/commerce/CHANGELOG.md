# @cogenta/commerce

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
