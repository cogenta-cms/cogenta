import type { ApprovalQueue, AuditLogLike } from '@cogenta/agents'
import type { ChannelIdentity, NotificationChannelMessage } from '../adapter.js'
import type { CommandHandlerInput, RegisteredCommand } from '../inbound/router.js'
import type { ApprovalTokenStore } from './store.js'

export interface ApprovalCommandsOptions {
  readonly tokenStore: ApprovalTokenStore
  readonly approvalQueue: ApprovalQueue
  readonly auditLog: AuditLogLike
  readonly getUserRoles: (userId: string) => Promise<readonly string[]>
  /** How a command handler replies — the channel of origin, since `route()` itself never sends anything (see `inbound/router.ts`'s `RouteResult`). */
  readonly reply: (identity: ChannelIdentity, message: NotificationChannelMessage) => Promise<void>
  readonly channelName: string
}

function notify(text: string): NotificationChannelMessage {
  return { level: 'notification', text }
}

/**
 * Builds the `/approve <token>` and `/deny <token>` commands — the channel
 * side of "Un agent en niveau `execute_with_approval` produit une entrée
 * dans la file d'approbation [...] deux actions : approuver, refuser."
 * Registered with `requiredRoles: []` on the router deliberately: the role a
 * decider actually needs varies per approval request (whatever the
 * underlying tool requires, e.g. `content.publish`), not per command name,
 * so the router's static per-command check cannot express it — the real
 * check happens here, per token, against `ApprovalTokenRecord.requiredRole`.
 */
export function createApprovalCommands(options: ApprovalCommandsOptions): {
  readonly approve: RegisteredCommand
  readonly deny: RegisteredCommand
} {
  async function handle(
    decision: 'approved' | 'rejected',
    input: CommandHandlerInput,
  ): Promise<void> {
    const token = input.args[0]
    if (token === undefined) {
      await options.reply(input.identity, notify('Précise le jeton : /approve <jeton>.'))
      return
    }

    const outcome = options.tokenStore.peek(token)

    if (outcome.kind === 'invalid') {
      await options.reply(input.identity, notify('Ce jeton d’approbation est invalide.'))
      return
    }
    if (outcome.kind === 'expired') {
      await options.reply(input.identity, notify('Ce jeton d’approbation a expiré.'))
      return
    }
    if (outcome.kind === 'already_decided') {
      await options.reply(
        input.identity,
        notify(
          outcome.decision === 'approved'
            ? 'Cette demande a déjà été approuvée.'
            : 'Cette demande a déjà été refusée.',
        ),
      )
      return
    }

    if (outcome.requiredRole !== null) {
      const heldRoles = await options.getUserRoles(input.userId)
      if (!heldRoles.includes(outcome.requiredRole)) {
        await options.reply(
          input.identity,
          notify(`Il te faut le rôle "${outcome.requiredRole}" pour décider de cette demande.`),
        )
        return
      }
    }

    options.tokenStore.markDecided(token, decision)
    await options.approvalQueue.decide(outcome.requestId, decision, input.userId)
    await options.auditLog.record({
      actorId: input.userId,
      actorRoles: outcome.requiredRole === null ? [] : [outcome.requiredRole],
      action: 'channel.approval.decide',
      diff: { channel: options.channelName, requestId: outcome.requestId, decision },
    })

    await options.reply(input.identity, notify(decision === 'approved' ? 'Approuvé.' : 'Refusé.'))
  }

  return {
    approve: {
      name: 'approve',
      requiredRoles: [],
      handler: (input) => handle('approved', input),
    },
    deny: {
      name: 'deny',
      requiredRoles: [],
      handler: (input) => handle('rejected', input),
    },
  }
}
