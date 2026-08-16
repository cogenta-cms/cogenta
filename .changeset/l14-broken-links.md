---
'@cogenta/schema': minor
'@cogenta/cli': minor
---

Detect broken links across published content (L14 task 3)

`@cogenta/schema` gains `extractLinks` and `checkLinks`, and `@cogenta/cli`
gains `cogenta links check` to run them over a real site.

The crawl walks every published entry, collects every link it holds — a
rich-text `markDefs` href, a contract B action `target`, a plain `url` field —
and reports the ones that lead nowhere, telling apart a target that was
deleted, one that exists but is not published, a path no route can serve, and
a reference to a collection the site does not have. Each distinct target is
resolved once however many entries point at it.

Two deliberate limits, both documented in the code:

- **External URLs are opt-in** (`--external` / `checkExternal`). A HEAD that
  comes back 403 or 405 is retried as a GET, because plenty of hosts refuse
  HEAD on pages they serve happily.
- **Nothing schedules itself.** Rule R1 guarantees no durable worker, so
  "periodically" is a cron entry calling the command, not a scheduler
  pretending to exist inside the site. `cogenta links check` exits 1 when it
  finds something, so it works as a CI or cron check.

Note: the full-text index is not reused for this, as the lot suggested it
might be — `search/extract.ts` deliberately strips `href`, `url` and
`markDefs` before indexing, so it holds no URL at all.
