---
'@cogenta/schema': minor
'@cogenta/core': minor
---

Add slugs, routing, automatic 301 redirects and scheduled publication to `@cogenta/schema`.

**Slugs.** `slugify` transliterates with `normalize('NFD')` and a written-down table for
the letters Unicode does not decompose — "ß", "æ", "ø" — so it needs no dependency and no
data file. `deriveSlug` reads the source named by `f.slug({ from: 'title' })`, keeps a
slug the editor typed by hand, and resolves collisions with a `-2`, `-3` suffix that
stays inside the length budget rather than growing past the column width. Uniqueness is
scoped **per collection and per locale**, which is what ADR-0014 implies: the French and
the English article are two entries, and both are legitimately `/mon-article` under their
own prefix.

**Redirects.** Changing the slug of a **published** entry now writes a 301 with nobody
asking for it, and the table is listable, filterable and deletable. Two properties are
enforced at write time rather than left to whoever reads the table later:

- chains are flattened — renaming a page twice leaves one hop, not two, so a visitor
  never pays for the site's edit history;
- loops are refused with `CONTENT_REDIRECT_LOOP`, and moving a page back to its old URL
  is expressed as `release()` rather than as a cycle the store quietly repairs.

A draft that changes slug records nothing: nobody could reach the old URL, and a redirect
from an unreachable path is a row that only ever confuses.

**Routing.** `matchPath` resolves a URL against `routing.pattern`, with or without the
locale prefix, and `buildPath` goes the other way. `resolveUrl` answers `entry`,
`redirect` or `notFound` — content first, redirects second, so a stale rule can never
shadow a page that is live.

**Scheduled publication.** An entry in `status: 'scheduled'` becomes a job in the L0
queue, and the whole module is written against `QueueDriver` and nothing else. It
therefore works on the `database` queue — the driver with no worker of its own, drained
by a cron calling `tick()`. On a cron every five minutes, a page scheduled for 09:00 goes
live between 09:00 and 09:05; that is the honest promise of a host without a worker, and
the handler logs the lateness so the question can be answered when it is asked. An entry
whose hour passed while the site was down publishes on the next tick instead of being
skipped.

`@cogenta/core` gains five error codes for the above: `CONTENT_SLUG_INVALID`,
`CONTENT_SLUG_TAKEN`, `CONTENT_ROUTE_INVALID`, `CONTENT_REDIRECT_LOOP` and
`CONTENT_SCHEDULE_INVALID`. Adding a code is a minor change; no existing code changed
meaning.
