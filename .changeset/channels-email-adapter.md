---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add the email channel adapter (L6 task 8) — outbound-only (the lot's task
list names this adapter without "commandes entrantes", unlike Telegram's
task 4), buttonless: an `Alert`'s two actions render as HMAC-signed,
single-use links (`## Approbations depuis le canal`'s explicit guidance for
channels without buttons) reusing L6 task 5's real signing primitive rather
than a new one.

R1-compliant `EmailTransport` interface with one real, tested,
no-external-service implementation (`createFileEmailTransport`, writes each
message to disk) — a real SMTP/HTTP-API transport is a deliberate,
documented follow-up, not built in this pass; raw SMTP is a materially
larger undertaking than Telegram's plain-HTTP Bot API and was judged
disproportionate to this task's scope.

Two new `@cogenta/core` error codes: `CHANNEL_EMAIL_TRANSPORT_ERROR`,
`CHANNEL_EMAIL_INBOUND_UNSUPPORTED`.
