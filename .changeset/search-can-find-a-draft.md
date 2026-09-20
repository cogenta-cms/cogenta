---
'@cogenta/schema': minor
'@cogenta/api': minor
---

Let an admin search actually find a draft.

The admin's search screen offers a "Statut" filter whose first option is
"Tous les statuts", and choosing it sent no `status` at all — and no `status`
means `published`, the safe default for a caller that says nothing. So a
filter offering every state delivered the one an anonymous visitor sees, and
an editor could not find their own unpublished work through it.

`?status=any` says it explicitly. It is not a way around the gate: `any` is
checked by exactly the same `canReadUnpublished` that guards `status=draft`,
so an anonymous caller asking for it gets the same 403 it always got.

`SearchQuery.status` accepts a list as well as one value, and the shared
`scopeFilters` turns that into `status in (…)`. The state predicate is never
dropped, only widened — that clause is what stops a draft reaching a reader
who has no right to it, and it stays present on all three engines. An empty
list reads as "nothing matches" rather than widening to everything.

The admin asks for the widest scope and falls back when refused, rather than
re-deriving the permission rule client-side: whether these roles reach drafts
is the permission layer's decision (R4), and a second copy of that rule would
be one that drifts.
