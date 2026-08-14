---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add the generic signed webhook channel (L6 task 11, the final task of the
L6 lot) — the security primitive "## Pièges connus" names explicitly:
"Les webhooks entrants sont une surface d'attaque. Vérification de
signature obligatoire, fenêtre temporelle, protection contre le rejeu."

`verifyIncomingWebhook` checks all three, mandatory: HMAC-SHA256
signature authenticity (constant-time comparison, same construction as
`approvals/signed-link.ts`), timestamp freshness against an injectable
clock (default 5-minute window), and replay rejection via a bounded
in-memory `WebhookReplayGuard` — a request failing any check is rejected
with a distinguishable, typed `CogentaError` (unlike identity-linking's
deliberately uniform code, there is no enumeration oracle here: a
webhook secret is either configured correctly or it isn't, and
distinguishing "bad signature" from "stale timestamp" from "already
processed" is a legitimate operator need). `signOutgoingWebhook` is the
matching outbound half `createWebhookAdapter`'s `send()` uses on every
request — round-trip tested against the real verifier, not just each
half in isolation.

`createWebhookAdapter` is outbound-only: `capabilities.buttons` is
`false` (no UI to click — actions render as real signed links, reusing
the same primitive the email adapter, task 8, already consumes) and
`capabilities.inbound` is `false` — real inbound command execution for
an arbitrary third-party caller is a materially larger undertaking
(a live HTTP route, per-integration identity decisions) than this
task's actual deliverable, the signing/verification primitive itself,
which is complete and exercised end-to-end. `verifyIdentity` is an
honest refusal, matching the email adapter's precedent.

Three new `@cogenta/core` error codes: `CHANNEL_WEBHOOK_SIGNATURE_INVALID`,
`CHANNEL_WEBHOOK_EXPIRED`, `CHANNEL_WEBHOOK_REPLAY_DETECTED`, plus
`CHANNEL_WEBHOOK_DELIVERY_FAILED` and `CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED`.

L6 ("Canaux") is now complete — all 11 tasks done.
