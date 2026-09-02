---
"@cogenta/commerce": minor
"@cogenta/cli": patch
---

Audit A1-commerce (P2) — open carts nobody touches are now actually marked
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
