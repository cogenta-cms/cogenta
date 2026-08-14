---
'@cogenta/channels': minor
'@cogenta/core': patch
---

Adds a complete Discord channel adapter (L6 task 10): outbound messages
rendered as real embeds with button components, inbound message/interaction
handling routed through the existing identity-linking and human-permission
authorization gate (never a parallel path), a real Gateway WebSocket client
with deterministic heartbeat scheduling, and 429 rate-limit handling using
Discord's actual `retry_after` value. One new `@cogenta/core` error code:
`CHANNEL_DISCORD_API_ERROR`.
