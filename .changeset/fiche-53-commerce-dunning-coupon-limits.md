---
"@cogenta/commerce": minor
"@cogenta/core": minor
---

Fiche 53 — coupon per-customer/product limits and a real dunning machine for failed
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
