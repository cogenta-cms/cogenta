---
'@cogenta/channels': minor
---

Add the channel-actionable approval queue (L6 task 5) — "Un agent en
niveau `execute_with_approval` produit une entrée dans la file
d'approbation. Le canal reçoit un message [...] deux actions : approuver,
refuser."

Builds a channel-facing layer on top of `@cogenta/channels`'s new
dependency on `@cogenta/agents`' real `ApprovalQueue`
(`createMemoryApprovalQueue`) rather than a new approval concept:
`dispatchApproval` renders an `ApprovalRequest` as an `AlertChannelMessage`
with two one-time tokens (12 Crockford-alphabet characters, 60 bits of
entropy, 20-minute TTL — longer than the linking code's, since approving a
real action deserves more time than typing a code just seen), and
`createApprovalCommands` registers `/approve`/`/deny` on a
`CommandRouter` that redeems them.

A button press routes through the exact same `CommandRouter.route()` and
`authorizeInboundCommand` security gate a typed command does — no second
authorization path. Per-token `requiredRole` (not per-command, since
different tools need different permissions) is checked before deciding.
`ApprovalTokenStore.peek`/`markDecided` are first-write-wins and return a
real discriminated outcome (`ready`/`already_decided`/`expired`/`invalid`)
rather than throwing — "Une entrée déjà traitée rend le bouton inopérant,
avec message clair — pas d'erreur brute." Every decision is journalled via
the real `AuditLogLike.record`, naming the channel of origin in `diff`.

A signed-link primitive (`buildSignedApprovalLink`/
`verifyApprovalLinkSignature`, HMAC-SHA256 with constant-time comparison,
mirroring `StorageDriver`'s `signedUrl`) is included for buttonless
channels — "Sur un canal sans boutons (email, webhook), l'action est un
lien signé à usage unique" — tested in isolation; no buttonless adapter
exists yet to consume it (email/webhook are later lot tasks).

Full agent → queue → channel → action → audit cycle proven by a real
integration test, plus the lot's two explicit acceptance criteria: a
reused token is refused without re-deciding, an expired token is refused
with a clear message, not a raw error.
