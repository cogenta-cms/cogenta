---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add `@cogenta/channels`'s notification preferences and grouping (L6 task
7) — per `(userId, channelName)`: opted-in event types, minimum severity,
quiet hours, and a grouping mode (`immediate | hourly | daily`).

A `NotificationDispatcher.notify()` filters against these preferences and
either sends immediately or queues the notification; `flushDue()`
collapses every due group into a single message (a `Report` via
`buildReport` for more than one queued item, a `Notification` for
exactly one) — this is what turns fifteen dependency-scan findings into
one grouped message instead of fifteen separate ones
("## Préférences", `docs/lots/L6-canaux.md`).

Quiet hours defer a non-critical notification until the window ends
rather than dropping it; a `critical`-severity notification always
bypasses quiet hours. Preferences persist via a new `cogenta_channel_preferences`
table (`ensurePreferenceTables`), following the same `create table if
not exists` pattern as `ensureChannelTables`.

One new `@cogenta/core` error code: `CHANNEL_PREFERENCES_INVALID`.
