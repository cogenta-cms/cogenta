---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add the Slack channel adapter (L6 task 9) — the second real
`ChannelAdapter`, wired to the same identity linking and inbound command
routing Telegram (task 4) already proved.

Zero-dependency: a small hand-typed client (`createSlackClient`) calls
Slack's plain HTTPS/JSON Web API directly via `fetch`, same reasoning as
the Telegram client. Socket Mode, not the Events API webhook — Slack's own
real, officially-supported answer to "no public HTTPS endpoint," same
reasoning as Telegram's long-polling choice (no plane of this project is
deployed publicly yet). `createSlackSocketClient` opens a WebSocket via
`apps.connections.open`, using Node's built-in `WebSocket` global (stable
since this project's Node 22 minimum) — no new dependency needed for the
transport either. A `disconnect` envelope triggers exactly one
reconnect, mirroring Telegram's continuous poll loop.

Rate limiting: Slack signals a 429 via an HTTP `Retry-After` header
(unlike Telegram's JSON `retry_after` field) — read correctly and
retried with the real value, never a guessed backoff.

Message rendering (`renderSlackMessage`) turns the abstract
`ChannelMessage` into Slack Block Kit blocks, entirely inside this
adapter. A button's `action_id`/`value` is literally the command text it
routes as — a Block Kit button press (`block_actions`) goes through the
exact same `CommandRouter.route()` a typed message does, never a second,
parallel authorization path. An unlinked identity's message is tried
once as a linking code, exactly like Telegram; every other case stays
silent.

Capabilities declared honestly: `threads`/`attachments` are `false` —
not built this pass, deferred rather than half-implemented.

One new `@cogenta/core` error code: `CHANNEL_SLACK_API_ERROR`.
