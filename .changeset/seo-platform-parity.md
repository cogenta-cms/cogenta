---
"@cogenta/core": minor
"@cogenta/seo": minor
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Fiche 70 (SEO platform parity — AIOSEO/The SEO Framework/MonsterInsights/Site
Kit) — four tasks closing the gaps a real research pass found against those
four tools, which the earlier SEO fiches (13, 50) never looked at.

**Task 1 — real-time content score.** `@cogenta/seo` gains `analyseContent`
(`content-analysis.ts`): a pure, synchronous TruSEO-style scorer over
contract A's rich text — keyword usage in title/description/first sentence,
keyword density, sentence length, subheadings, content length. Returns a
closed `'red' | 'orange' | 'green'` score, never a numeric percentage. A new
conventional field, `seoFocusKeyword`, joins `seoTitle`/`seoDescription`/etc.
(contract A untouched). The admin panel keeps its own mirrored copy of the
algorithm rather than depending on `@cogenta/seo`/`@cogenta/schema` — the
admin is a browser bundle and never takes that dependency.

**Task 2 — internal link assistant.** `@cogenta/seo` gains
`analyseInternalLinks` (`link-assistant.ts`), reusing `@cogenta/schema`'s
existing `extractLinks`: reports entries with no inbound link and, for
entries sharing title words, up to five link candidates. `@cogenta/api`'s
`createSeoRouter` gains `GET /api/seo/link-suggestions?collection=…`, gated
by `update` on the named collection (never `admin`) so an editor can run it
on whatever they may already write.

**Task 3 — SEO feature grid.** Four new `seo.*` boolean settings
(`contentScoreEnabled`, `linkAssistantEnabled`, `searchVerificationEnabled`,
`robotsCustomRulesEnabled`) in `@cogenta/schema`'s site settings registry,
all defaulting to `true` so an upgrading site's behaviour is unchanged. The
last two are gated centrally inside `@cogenta/cli`'s `readSeoRenderDefaults`,
so every consumer (public `robots.txt`, verification meta tags, the
diagnostics scan) honours the toggle with no per-call-site duplication.

**Task 4 — optional Google Search Console connector (ADR-0032).**
`@cogenta/seo` gains `search-console.ts`: a fetch-only OAuth client (no
`googleapis` SDK) for the authorization URL, token exchange/refresh, and one
read-only `searchAnalytics.query` call — structurally incapable of writing
anything on the Google side. `@cogenta/schema` gains
`createSearchConsoleConnectionStore`: one site-wide connection row,
AES-256-GCM at rest via `COGENTA_AUTH_SIGNING_KEY` (same discipline as the
LLM provider store), full SQLite/Postgres/MySQL/MariaDB contract suite.
`@cogenta/api` gains `createSearchConsoleRouter`
(`/api/seo/search-console/*`): `status`/`authorize`/`metrics`/`disconnect`
are admin-only; `callback` (Google's own browser redirect target) carries no
bearer token by design, proven legitimate instead by an HMAC-signed,
ten-minute `state` token keyed by `COGENTA_AUTH_SIGNING_KEY`. `@cogenta/core`
gains the `searchConsole` config section (client id/secret, environment-only,
refused in the config file like every other secret) and five new error codes
(`SEARCH_CONSOLE_NOT_CONFIGURED`/`_NOT_CONNECTED`/`_STATE_INVALID`/
`_TOKEN_EXCHANGE_FAILED`/`_QUERY_FAILED`). Absent without both
`COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`_CLIENT_SECRET` set — every other SEO
feature, including tasks 1-3 above, works identically with or without it
(R1/R2), which was the explicit condition the user set when accepting
ADR-0032.
