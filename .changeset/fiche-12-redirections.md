---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Redirects: 404 log, prefix patterns, editing, CSV import/export, automatic
redirect on slug rename, and 307/308/410 status codes (fiche 12).

**`@cogenta/core`**: gains a `notFoundLog` config section (`enabled`,
`maxPaths`, `retainDays`) — on by default, bounded, purged past its
retention. Never stores an IP address or a user agent.

**`@cogenta/schema`**:
- `RedirectStatus` widens from `301 | 302` to `301 | 302 | 307 | 308 | 410`.
  A 410 (Gone) row needs no `to`. Consumers that exhaustively switch on
  `RedirectStatus` — a rare pattern, but a real one — need a case for the
  three new values.
- `RedirectStore` gains `update(from, { to?, status? })` — implementors of
  the interface (not typical callers) must add it. `RedirectStore.add`'s
  `to` is now optional, required only when `status` is not 410.
- New: `createNotFoundLogStore`/`NotFoundLogStore` (the 404 log — aggregated
  by path, capped at `maxPaths` distinct paths, no personal data ever) and
  `createRedirectPatternStore`/`RedirectPatternStore` (prefix redirects —
  `/blog/*` to `/actualites/*` — matched by `startsWith`, never a regular
  expression, so the public routing path can never be exposed to
  catastrophic backtracking).
- New: `withRedirectTracking` — wraps a `ContentStore` so renaming the slug
  of a **published** entry writes a 301 from the old path to the new one on
  its own, reversibly (renaming back makes the redirect disappear), and a
  chain of renames stays flattened to one hop.

**`@cogenta/api`**: `redirect-router.ts` gains `PATCH /api/redirects` (edit
in place), `?q=`/`?limit=`/`?offset=` on the list, `/api/redirects/patterns`
(prefix redirects), and `/api/redirects/export` / `/api/redirects/import`
(CSV, always previewed before anything is written — pass `apply: true` to
commit). New `createNotFoundRouter` (`GET`/`DELETE /api/not-found`). New
`parseCsv`/`stringifyCsv` — hand-written, zero dependency (R9).

**`@cogenta/cli`**: `cogenta serve` mounts `/api/not-found` and the new
`/api/redirects/*` routes, applies prefix-redirect resolution after the
exact-match table finds nothing, answers a 410 with no `Location` header,
records every public GET that matches no route into the 404 log (never for
`/api/*`), and purges the log past its retention on a daily tick (new
`ServeOptions.notFoundPurgeTickMs` overrides it, for tests). Renaming the
slug of a published entry now writes its redirect automatically, wired
through `withRedirectTracking`.
