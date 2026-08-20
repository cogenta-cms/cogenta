---
"@cogenta/analytics": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/core": minor
---

Analytics drill-down (fiche 27): pages, referrers, period comparison, custom
date range, entry-editor stats, CSV export, and configurable, automatically
purged retention — the gaps found against Jetpack Stats/Plausible/Matomo. No
new field is collected: every addition is computed from the events row this
package already wrote (path, referrer domain, device, daily-salted session
hash), so the site's cookie-free, no-consent-banner posture is unchanged.

**`@cogenta/analytics`**: `AnalyticsStore.getSummary` now returns
`previousTotalViews`/`previousUniqueVisitors`/`viewsChangePercent` — the
equal-length window immediately before the requested one, with `null` (never
a misleading `0`) when there is no previous traffic to compare against.
`getPageStats(path, window)` reports one page's views, previous-period views
and rank among every path seen in the window — what an entry-editor sidebar
needs, without pulling the whole top-N list. `purgeEvents(retainDays)` and
`purgeSalts(retainDays)` delete rows past a configured retention; the events
table is the largest table on a site with real traffic, and there is no way
to disable purging outright, only to choose how long to keep.

**`@cogenta/core`**: new config section `analytics.retainDays` (default 400
days), resolved alongside every other site setting.

**`@cogenta/api`**: `createAnalyticsRouter`'s `GET /api/analytics/summary`
accepts a custom `?since=&until=` range (alongside the existing `?days=`),
reports the period-over-period comparison, and — when the caller wires in
`resolvePage` — enriches each top page with its entry's title and admin edit
link. A new `GET /api/analytics/page?path=` answers the same admin-only stats
for one page. `retainDays`, when wired in, is echoed back as `retentionDays`
so the admin screen can show a real number instead of a promise.

**`@cogenta/cli`**: `cogenta serve` wires the new `analytics.retainDays`
config into a daily purge tick (same shape as the existing scheduled-publish
tick — a sweep right away, then one every 24h) and resolves top pages against
the site's real routes and permission-checked content gateway, so the summary
screen can link straight to the entry in the admin.

Purely additive: a site that never reads `/api/analytics/summary` behaves
exactly as before.
