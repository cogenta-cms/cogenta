---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
'@cogenta/starters': minor
---

Sort a list by a date the collection declares itself (L40, contract A `schema@2.4`,
ADR-0038)

`SortOrder.field` accepts the name of a declared `date`/`datetime` field beside `id`,
`createdAt` and `updatedAt` — which is what makes "the next events" a list a site can
actually show. Entries with no date are **always last**, in both directions, by an order
written out explicitly (`case when … is null`) rather than left to each engine's own null
placement; the cursor carries a nullable value, so the tail of empty dates pages like the
rest. Any other field is refused by name, with the collection said in the message.

In a stored filter, the exact tokens `"$now"` and `"$today"` are resolved by the API at
every request and never stored resolved — a "from now on" list saved today must still be
true tomorrow. A page whose blocks depend on the clock has its public cache lifetime
capped at an hour.

Two defects found by a dialect review and fixed here: a cursor was minted from the entry
rather than from the row the database ordered, which silently dropped rows in the working
state when a pending draft moved a date; and a date cleared to an empty string is now
stored as no date at all, which also fixes clearing a date field from the admin.

Strictly additive: a caller that sorts by a system column gets exactly the ordering and
the cursor it got before.
