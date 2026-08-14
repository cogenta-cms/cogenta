---
'@cogenta/channels': minor
'@cogenta/core': minor
---

Add `@cogenta/channels`'s inbound command routing (L6 task 3) — the
payoff for tasks 1 and 2: "## La règle de sécurité centrale"
(`docs/lots/L6-canaux.md`), **"Une commande entrante s'exécute avec les
permissions de l'humain identifié, jamais avec celles de l'agent."**

`authorizeInboundCommand(identity, requiredRoles, getUserRoles)` — the
single security gate every inbound command passes through. An unlinked
identity (`linkedUserId: null`) is refused with `shouldReply: false`,
matching "Une identité de canal non liée à un compte est ignorée, sans
réponse — répondre confirmerait l'existence du bot à un inconnu": a
consuming adapter that just checks the flag gets that property for free.
A linked-but-unauthorized user is refused with `shouldReply: true`
(they're a known person and may be told so). An authorized result always
carries the identity's real, verified `linkedUserId` — never anything
read off the inbound payload itself.

`createCommandRouter({getUserRoles})` — parses `/name args`, looks up a
registered handler, and routes through `authorizeInboundCommand` before
ever invoking it. The unlinked check happens before even checking whether
the command is recognized, so an unlinked stranger gets silence for
*any* input, not just for commands that exist — an "unknown command"
reply would itself leak the bot's existence.

`requiredRoles` reuses contract A's own open role-name-array convention
(`CollectionDefinition.permissions`, `@cogenta/api`'s `PermissionLayer`)
rather than a parallel permission-string system.

One new `@cogenta/core` error code: `CHANNEL_COMMAND_DUPLICATE`.
