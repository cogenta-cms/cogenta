---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add the Telegram channel adapter (L6 task 4) — "Telegram en premier,
complet": the first live `ChannelAdapter`, wired to tasks 2/3's identity
linking and inbound command routing.

Zero-dependency: a small hand-typed client (`createTelegramClient`) calls
Telegram's plain HTTPS/JSON Bot API directly via `fetch`, following this
project's established precedent (`@cogenta/import`'s WXR parser,
`@cogenta/mcp`'s JSON-RPC subset) of a small hand-rolled client over a new
SDK dependency for a REST API this simple.

Transport: long-polling (`getUpdates`), not a webhook — a webhook needs a
real public HTTPS endpoint and Telegram's own signature verification, and
no plane of this project is deployed publicly yet (L9 task 12's scoping).
Polling works unchanged wherever `cogenta serve` already runs.

Rate limiting: a 429 response is retried using Telegram's own
`retry_after` value, never a guessed backoff — "Prévoir la file, le
backoff et le regroupement dès le premier adaptateur."

Message rendering (`renderTelegramMessage`) turns the abstract
`ChannelMessage` (alert/report/notification) into MarkdownV2 text plus
inline keyboard buttons, entirely inside this adapter — "on n'écrit pas
de Markdown Telegram dans le code métier." A button's `callback_data` is
literally the command text it routes as: a button press goes through the
exact same `CommandRouter.route()` a typed command does, never a second,
parallel authorization path. An unlinked identity's message is tried
once as a linking code (confirmed on success, silent on any failure) —
"Une identité de canal non liée à un compte est ignorée, sans réponse"
still holds for everything else.

One new `@cogenta/core` error code: `CHANNEL_TELEGRAM_API_ERROR`.
