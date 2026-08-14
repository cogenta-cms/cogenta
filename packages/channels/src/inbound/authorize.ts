import type { ChannelIdentity } from '../adapter.js'

/**
 * "Une identité de canal non liée à un compte est ignorée, sans réponse —
 * répondre confirmerait l'existence du bot à un inconnu." An unlinked
 * identity is a fundamentally different posture than a linked-but-forbidden
 * one: the caller must be able to do nothing at all without effort, so
 * `shouldReply` is `false` here and `true` below — a channel adapter that
 * simply checks this flag before sending anything gets the security
 * property for free, instead of having to remember "unlinked = silent" as
 * a rule to not forget.
 */
export interface UnlinkedResult {
  readonly ok: false
  readonly reason: 'unlinked'
  readonly shouldReply: false
}

/**
 * "Un utilisateur sans `content.publish` ne peut pas approuver une
 * publication depuis Telegram, même s'il voit le message." A linked user
 * who lacks the required role(s) is refused the action but is a known
 * person — they may be told so.
 */
export interface ForbiddenResult {
  readonly ok: false
  readonly reason: 'forbidden'
  readonly shouldReply: true
  readonly userId: string
}

/**
 * The only shape that carries a `userId` a command may act as. It is
 * always the identified human's real id — never the agent's, never
 * anything read off the inbound payload itself, which an attacker fully
 * controls.
 */
export interface AuthorizedResult {
  readonly ok: true
  readonly userId: string
}

export type AuthorizationResult = UnlinkedResult | ForbiddenResult | AuthorizedResult

/**
 * "Une commande entrante s'exécute avec les permissions de l'humain
 * identifié, jamais avec celles de l'agent." — the one function every
 * inbound command handler must pass through before doing anything. It
 * derives the acting user exclusively from `identity.linkedUserId` (set
 * only by the real, verified linking flow, L6 task 2) and from real roles
 * fetched for that id — never from `identity.channelUserId` or any other
 * field an inbound message controls. Bypassing this check requires a
 * caller to deliberately not call it; there is no path through it that
 * hands out a permission the identified user does not really hold.
 *
 * `requiredRoles` mirrors contract A's own open role-name-array convention
 * (`CollectionDefinition.permissions`, `@cogenta/api`'s `PermissionLayer`)
 * rather than inventing a parallel "permission string" system for
 * channels — an empty list means "any linked user may run this command".
 */
export async function authorizeInboundCommand(
  identity: ChannelIdentity,
  requiredRoles: readonly string[],
  getUserRoles: (userId: string) => Promise<readonly string[]>,
): Promise<AuthorizationResult> {
  const userId = identity.linkedUserId
  if (userId === null) {
    return { ok: false, reason: 'unlinked', shouldReply: false }
  }

  if (requiredRoles.length === 0) {
    return { ok: true, userId }
  }

  const heldRoles = new Set(await getUserRoles(userId))
  for (const role of requiredRoles) {
    if (heldRoles.has(role)) return { ok: true, userId }
  }

  return { ok: false, reason: 'forbidden', shouldReply: true, userId }
}
