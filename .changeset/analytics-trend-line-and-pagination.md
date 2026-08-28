---
"@cogenta/analytics": minor
"@cogenta/api": minor
---

Fiche 64 (analytics: trend lines) — the analytics summary now carries a
day-by-day breakdown for the previous period, not just its scalar total.

`@cogenta/analytics`'s `AnalyticsSummary` gains `previousDailyViews`, computed
by `getSummary` with the same `substr(at, 1, 10)` grouping `dailyViews`
already used, scoped to `[previousSinceIso, sinceIso)`. This is what lets a
consumer draw the previous period as a second series lined up against the
current one — until now the only previous-period signal was
`previousTotalViews`, enough for a `%` badge but not for an overlay line.
Additive: every existing field keeps its exact shape and meaning.

`@cogenta/api`'s `GET /api/analytics/summary` gains an optional `?limit=`
(1–100, default unchanged at `DEFAULT_SUMMARY_LIMIT`/10), forwarded to
`getSummary({ limit })`. This is what lets a caller ask for more than 10
`topPages`/`topReferrers` rows to paginate over client-side — the store has
no offset-based pagination of its own, so "give me more rows" is the only
way to page past the first ten. An out-of-range value is rejected the same
way `?days=` already is (`QUERY_INVALID`, 400).

Both changes are additive and backward compatible: an existing caller that
never passes `?limit=` or reads `previousDailyViews` sees no change in
behaviour.
