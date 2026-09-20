---
'@cogenta/api': patch
---

Answer `200` when a redirect replaces the rule that already left that path.

One path has one rule: `RedirectStore.add` treats a second rule leaving the
same `from` as a replace, deliberately and by its own documentation. Both
requests answered `201` with a fresh identifier, which reads as "you now have
two" — while the first rule's destination had silently changed under whoever
wrote it.

A replace answers `200`. The body is unchanged, and so is what is stored.
