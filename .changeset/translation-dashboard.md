---
"@cogenta/schema": minor
"@cogenta/api": minor
---

Add the translation dashboard (fiche 10 task 1) — everything needed to answer "what
is still missing in each language" in one screen, without an `N × M` scan.

`@cogenta/schema`'s `ContentStore` gains `translationsOfMany(rootIds)`: every
working-state translation of a batch of root entries, in one query. A custom
`ContentStore` implementation (uncommon — everyone else constructs one through
`createContentStore`) needs to add it.

`@cogenta/api`'s `ContentService` gains `translationMatrix(context, name, query)`,
and REST gains `GET /{collection}/-/translation-matrix`: one row per root entry
(`translationOf: null`), one cell per locale carrying its state (absent, draft,
published, archived, scheduled) and, when the locale is a translation, whether the
source changed since (`obsolete`) — a plain `updatedAt` comparison, stated as a fact
rather than a verdict, per the fiche's own recommendation for signal (a). Requires the
same `read` permission `GET .../translations` already does, plus the working-state
gate; every row still passes the ordinary per-entry draft/preview gate.

Honestly scoped: today's `PermissionLayer` has no per-locale permission, only
per-collection — a role cannot be "denied French" independently of the collection
itself. That is a permission-model change, not a dashboard change, and is
deliberately out of this note's scope.
