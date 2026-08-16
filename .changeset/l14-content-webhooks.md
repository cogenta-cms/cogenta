---
'@cogenta/channels': minor
'@cogenta/schema': minor
'@cogenta/core': minor
'@cogenta/cli': minor
---

Send a real signed webhook when content is published (L14 task 1)

The signed outbound webhook channel has existed since L6 and nothing ever
called it. It is now connected to the content lifecycle.

- `@cogenta/channels` gains `createWebhookEventSender`, which POSTs a
  structured `{ event, occurredAt, data }` envelope to every configured
  endpoint. It reuses `signOutgoingWebhook` and the existing
  `X-Cogenta-Timestamp` / `X-Cogenta-Signature` headers **verbatim**, so a
  receiver verifies an event with `verifyIncomingWebhook` exactly as it
  verifies a message — there is no second signing path. It never throws: a
  failed delivery comes back as a result to log, so an editor's publish is
  never lost to somebody else's downtime.
- `@cogenta/schema` gains `withLifecycleEvents`, a `ContentStore` decorator in
  the same shape as `withSearchIndexing`. It emits `content.publish` (from
  `publish()`, and from `create()` with a published status),
  `content.unpublish` and `content.delete`, each carrying the entry's
  identity, status, timestamps and its real route path from `buildPath`.
  Draft edits emit nothing. The event body never carries the content itself.
- `@cogenta/core` gains a `webhooks.endpoints` config section. The signing
  secret is environment-only (`COGENTA_WEBHOOK_SECRET`, rule R7); endpoints
  configured without it disable delivery with a startup warning rather than
  falling back to unsigned requests.
- `cogenta serve` wires the two together, outermost of all store decorators so
  an event only describes a write that really landed.

Proven end to end by a suite that publishes over real HTTP and verifies the
signature on the bytes a real `node:http` receiver got off the socket.
