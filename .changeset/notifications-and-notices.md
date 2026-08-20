---
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": patch
"@cogenta/plugins": minor
"@cogenta/channels": patch
---

Add the admin notification center (fiche 38): a bell with an unread count, filterable
by severity/period, bulk mark-as-read; new notice sources (plugin auto-disabled,
scheduled publication failed); channel-bridged notices reusing `@cogenta/channels`'
existing message formats, grouping and identity-linking (no second mechanism); and a
per-severity channel routing settings screen.

`@cogenta/schema` gains `scheduled-publish-failures` store used by the new notice
source. `@cogenta/api` gains a real `@cogenta/channels` dependency, new notice-router
routes for channel settings and notice history, and a `plugin-disabled`/
`scheduled-publish-failed` notice source pair. `@cogenta/plugins` exposes disabled-state
data the new notice source reads. `@cogenta/channels`' preference types gain the field
the settings screen needs.
