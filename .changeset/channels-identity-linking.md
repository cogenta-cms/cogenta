---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add `@cogenta/channels`'s identity-linking mechanism (L6 task 2): a
one-time code generated on the admin side, verified from a channel, tying
a channel-side identity (`channelName`/`channelUserId`) to a real Cogenta
user — the piece "## La règle de sécurité centrale" (`docs/lots/L6-canaux.md`)
depends on.

`createChannelLinkStore(db, now?)` — `generateCode`, `verifyCode`,
`resolveIdentity`, `revoke`, `listLinkedChannels`, all real, persisted
(SQLite/Postgres/MySQL via `ensureChannelTables`, following
`@cogenta/auth`'s `ensureAuthTables` pattern — no separate migration file).

Codes are 8 characters from a 32-symbol unambiguous alphabet (Crockford-style,
`0`/`O`/`1`/`I`/`L` removed), 40 bits of entropy, single-use, a short
default TTL (10 minutes, "valable quelques minutes" per the lot doc) —
judged against brute-forcing one code within its TTL window, not against
long-term-secret standards (session tokens remain 256 bits). Stored hashed,
never plain, like a session token.

`verifyCode` rejects every failure kind — nonexistent, expired,
already-used, wrong channel — with the same uniform `CHANNEL_LINK_CODE_INVALID`
error, so a caller cannot accidentally build a channel-facing reply that
leaks which reason applied (an enumeration oracle against unlinked
identities).

One new `@cogenta/core` error code: `CHANNEL_LINK_CODE_INVALID`.
