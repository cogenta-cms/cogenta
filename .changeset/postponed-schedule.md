---
'@cogenta/schema': patch
'@cogenta/cli': patch
---

A schedule pushed back no longer publishes at its old date

Rescheduling an entry never cancelled the job queued by the earlier save, and
the job that came due only checked that the entry was still `scheduled`. An
entry scheduled for Monday and moved to Friday therefore went out on Monday.

`@cogenta/schema` gains `isPublicationDue(entry, now?)`: the entry's current
`publishedAt` decides, not the job's. `cogenta serve` publishes only when it
is true, so the stale job does nothing and the later one publishes on time.
