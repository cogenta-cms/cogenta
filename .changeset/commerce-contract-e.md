---
'@cogenta/commerce': minor
'@cogenta/core': minor
---

E-commerce (L15), as a new package `@cogenta/commerce` on a **new contract E**
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
