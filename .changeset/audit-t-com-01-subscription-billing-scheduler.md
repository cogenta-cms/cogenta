---
"@cogenta/cli": patch
---

Audit T-COM-01 (P0) — `cogenta serve` now actually bills subscriptions.

`SubscriptionStore.runBilling`/`runDunning`/`sendRenewalNotices` (fiche 53 tasks 3 and
5, `@cogenta/commerce`) had no caller anywhere in `cogenta serve`: a subscription whose
renewal date came and went was never billed on a real site, a failed renewal payment was
never retried, and a renewal reminder was never sent — despite all three being fully
tested at `@cogenta/commerce`'s own level.

`runServe` now registers a new `commerce-subscriptions` scheduled task (daily by
default, overridable with the new `commerceBillingTickMs` test seam, same pattern as
`commerce-order-emails`) that runs all three in sequence. Unlike the order-email task,
this one is always registered — commerce tables and stores exist unconditionally
(contract E, ADR-0024), and only `sendRenewalNotices` itself needs an e-mail transport
to do anything, degrading to a safe no-op (R2) without one. `runServe` also now wires
`createEmailRenewalNotifier` (`@cogenta/commerce`, already exported since fiche 53 but
never called) as the subscription store's `notifyRenewal`, using the same degraded
`FileEmailTransport`/real transport every other transactional sender in this file
already has.

A real bug was caught and fixed while wiring this in: the new task's interval override
was missing from `scheduledTasksHeartbeatMs`'s `Math.min(...)` — the heartbeat itself is
what actually drives every scheduled task, and forgetting an override there means the
task's own `intervalMs` is irrelevant, since the heartbeat never runs often enough to
notice it is due. A comment already on that line names this exact failure mode as
something fiche 52's own commerce task once found and fixed for itself; T-COM-01 found
it again for its own task, caught this time by a real end-to-end test (an overdue
subscription billed within 5s of a 20ms tick) rather than a code read.

No contract change: `runBilling`/`runDunning`/`sendRenewalNotices`/
`createEmailRenewalNotifier` are all pre-existing `@cogenta/commerce` exports, unchanged
by this patch.
