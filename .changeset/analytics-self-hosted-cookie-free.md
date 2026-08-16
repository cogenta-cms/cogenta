---
'@cogenta/analytics': minor
'@cogenta/core': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Self-hosted, cookie-free page-view analytics — the one CMS feature category
the audit found completely missing. No third party, no cookie, no personal
data ever stored, consistent with R1 (no dure dependency on external
infrastructure) and the project's privacy stance.

**New package `@cogenta/analytics`.** One table (`cogenta_analytics_events`):
timestamp, page path, referring **domain only** (never the full referrer
URL), a device category reduced from the User-Agent (`desktop`/`mobile`/
`tablet`/`other`, never the raw string), and a **daily-salted session hash**
— never an IP address, never a cookie. The salt (`cogenta_analytics_daily_salts`)
is minted once per UTC day and rotates every day, so
`sha256(salt|ip|device)` for the same real visitor is a *different*, unrelated
value on every new day: nothing in the stored data can link two days of the
same visitor's traffic, even with full database access, because reproducing
yesterday's hash needs yesterday's IP, which was never written down. The IP
address and the full User-Agent are used only as transient inputs to that
hash and to the device classifier — neither is ever persisted. A dedicated
privacy test suite (`test/privacy.test.ts`) inspects the actual stored
columns, not just the public types, to prove this. `createAnalyticsStore`
aggregates views by day, top pages, top referring domains and device
breakdown; a same-session rate limit (60 events/minute) drops abusive
traffic silently rather than erroring.

**`@cogenta/core`** gains one error code, `ANALYTICS_SALT_UNAVAILABLE`
(an internal race-recovery failure, not expected in normal operation).

**`@cogenta/api`** gains `createAnalyticsRouter`: `GET /api/analytics/beacon`
(public, records one event, always answers `204` even on a malformed or
rate-limited request — a public collection endpoint must never break page
rendering) and `GET /api/analytics/summary` (`admin`-only, `?days=` window).

**`@cogenta/cli`** wires both into `cogenta serve` and injects the collection
tag into every rendered page. The tag is an invisible `<img>` pixel, not a
`<script>`: the theme's rendered output already carries a hard "zero
executable client JavaScript" property (enforced by a `serve.test.ts`
assertion), so a script reading `document.referrer` was not an option. The
referrer is instead read **server-side**, from the `Referer` header of the
request that is rendering the page, and baked straight into the pixel's URL
— no client code needed to capture it. The page builder's live-preview
render includes the same pixel (rather than omitting it) specifically to
keep its `<body>` byte-identical to the published page's, the invariant
`theme-render-fidelity` depends on.

The admin gains a full `/analytics` dashboard (hand-built SVG bar chart, no
charting dependency — R9) and a "views this week" widget on the main
dashboard, both `admin`-only like every other traffic-shaped view in the
admin.
