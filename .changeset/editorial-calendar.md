---
'@cogenta/api': minor
---

An editorial calendar read: `GET /api/content/-/calendar?from=&to=`

Returns the published and scheduled entries whose `publishedAt` falls in the
window, earliest first, and the drafts that could still be scheduled — across
every collection that declares `publishedAt` and whose unpublished entries the
actor may read, through the same draft and visibility gates as a list. Each
entry says whether the actor may move it (`publish`). The window is at most 93
days, and the walk is bounded and says when it stopped.
