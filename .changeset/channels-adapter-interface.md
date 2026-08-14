---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add `@cogenta/channels` (L6 task 1): the `ChannelAdapter` interface and
`createChannelRegistry`, the foundation for the L6 lot ("Canaux" —
Telegram, Slack, Discord, email, webhooks).

A message is described abstractly — `AlertChannelMessage`,
`ReportChannelMessage`, `NotificationChannelMessage` — matching the lot's
three fixed formats exactly, so no business code ever writes
platform-specific Markdown. `ChannelIdentity.linkedUserId` is `string |
null`, representing an unlinked channel identity as a first-class state:
the lot's central security rule ("une commande entrante s'exécute avec les
permissions de l'humain identifié, jamais avec celles de l'agent")
requires that state to exist even before a later task enforces it.
`InboundCommand` always carries the `ChannelIdentity` it came from, so a
command cannot be routed without knowing who — if anyone — sent it.

`createChannelRegistry` mirrors `@cogenta/agents`'s `createProviderRegistry`:
a site with zero channels configured works fine (R2's spirit), `get()` on
an unconfigured name throws a typed `CogentaError` rather than returning
`undefined`.

Two new `@cogenta/core` error codes: `CHANNEL_UNKNOWN`, `CHANNEL_DUPLICATE`.
