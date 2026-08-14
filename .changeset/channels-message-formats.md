---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add real constructors for the lot's three fixed message levels (L6 task 6)
— `buildAlert`/`buildReport`/`buildNotification` (`src/formats/`) — that
validate the exact rules `## Formats de message` states in prose: an alert
requires a title/context/expected-action and a real admin URL; a report
requires at least one key figure and refuses to exceed an abstract
480-character screen budget unless a `moreUrl` fallback is given; a
notification must be a real, non-empty single line. `approvals/message.ts`
now builds its alert through `buildAlert` instead of a hand-assembled
literal, so it gets the same validation for free.

Also hardens the Telegram adapter's report rendering with a real,
last-resort truncation at Telegram's actual 4096-character `sendMessage`
limit — the `moreUrl` footer is never the part that gets cut, since it's
the reader's only way to the full detail.

New `@cogenta/core` error code: `CHANNEL_MESSAGE_INVALID`.
