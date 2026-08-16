---
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Scheduled publication, written and tested since L1 (`@cogenta/schema`'s
`schedulePublication`/`registerScheduledPublishing`, a `QueueDriver`-based mechanism with
a real degraded `database` driver) but never wired to anything: an editor could set an
entry to "Scheduled" with a future date and nothing would ever happen — the admin showed
it as a read-only badge, honest about the gap rather than lying about it.

**The missing link was the write path, not the queue.** `ContentStore.update()` never
changes `status` (contract A keeps that transition to `publish`/`unpublish`), so there was
no way to move an *existing* entry into `scheduled` at all — only `create({status:
'scheduled', ...})` worked. `unpublish()` now also accepts `status: 'scheduled'` with a
required `publishedAt` (a `Date`, an ISO string, or epoch milliseconds), writing it as an
ordinary value of the collection's own `publishedAt` field the same way `publish()`
already does. A collection that never declared `publishedAt` refuses with
`CONTENT_SCHEDULE_INVALID` rather than accepting a schedule with nowhere to put the date.

`@cogenta/schema` gains `withScheduledPublishEnqueue`, a `ContentStore` decorator in the
same family as `withSearchIndexing`/`withLifecycleEvents`: wrapping `create`/`update`/
`unpublish`/`restore`, it calls `schedulePublication` whenever the result is
`status: 'scheduled'`. It re-enqueues on every save rather than tracking a previous job
id — safe, because the handler re-reads the entry before publishing and skips anything no
longer `scheduled` (an edit back to `draft`, or a manual publish that already happened).

`@cogenta/api`'s `POST /{collection}/{id}/unpublish` accepts
`{"status": "scheduled", "publishedAt": "…"}` alongside the existing `draft`/`archived`.

`cogenta serve` creates a `database`-backed `QueueDriver` per site (R1: no external
worker, no Redis — a table in the site's own database, drained in-process) and registers
the publish handler once, at `assembleSite`. `runServe` drains it on a `setInterval` —
once immediately at startup to catch up on anything overdue, then every 60 seconds for as
long as the process runs. The trade this makes, and the one worth knowing: a page
scheduled for 09:00 goes live between 09:00 and 09:01, and if the process is down when
09:00 comes, nothing is lost — the job is still in the table — it simply runs late, on
the first tick after the next start.

Not a CLI flag: `ServeOptions.scheduledPublishTickMs` overrides the cadence for tests
only (proving the loop really drains the queue without waiting a real minute for it); an
operator has no reason to touch it.

The admin's status control gains a real `datetime-local` picker (never free text),
offered whenever the collection declares `publishedAt`: "Programmer"/"Reprogrammer" call
the new `unpublish` shape, and "Annuler la programmation" moves a scheduled entry back to
draft.
