import type { ChannelIdentity, InboundHandler } from '../../adapter.js'
import type { CommandRouter } from '../../inbound/router.js'
import type { ChannelLinkStore } from '../../linking/store.js'
import type { SlackClient } from './client.js'
import type { SlackSocketEnvelope } from './socket.js'

const CHANNEL_NAME = 'slack'

interface SlackEventsApiPayload {
  readonly type: 'event_callback'
  readonly event: {
    readonly type: string
    readonly channel?: string
    readonly user?: string
    readonly text?: string
    readonly bot_id?: string
  }
}

interface SlackBlockActionsPayload {
  readonly type: 'block_actions'
  readonly user: { readonly id: string }
  readonly channel?: { readonly id: string }
  readonly actions: readonly { readonly action_id: string; readonly value?: string }[]
}

export interface SlackInboundDeps {
  readonly client: SlackClient
  readonly linkStore: ChannelLinkStore
  readonly router: CommandRouter
  /** The handler registered via the adapter's `onInbound()`, if any. */
  getExternalHandler(): InboundHandler | undefined
}

/**
 * The real routing/authorization wiring for one inbound Slack envelope —
 * extracted from the adapter, same shape as
 * `providers/telegram/inbound.ts`. Handles both a typed message
 * (`events_api`) and a button press (`interactive`'s `block_actions`, whose
 * `action_id`/`value` is itself a command string rendered by `render.ts`)
 * through the exact same `CommandRouter.route()`, never a second, parallel
 * authorization path.
 */
export function createSlackInboundHandler(
  deps: SlackInboundDeps,
): (envelope: SlackSocketEnvelope) => Promise<void> {
  async function resolveIdentity(channelUserId: string): Promise<ChannelIdentity> {
    return deps.linkStore.resolveIdentity(CHANNEL_NAME, channelUserId)
  }

  async function reply(channelId: string, text: string): Promise<void> {
    await deps.client.postMessage({ channel: channelId, text })
  }

  async function handleText(channelId: string, channelUserId: string, text: string): Promise<void> {
    let identity = await resolveIdentity(channelUserId)

    if (identity.linkedUserId === null) {
      // An unlinked identity gets exactly one thing to try: the message AS
      // a linking code. Any other failure stays silent — "Une identité de
      // canal non liée à un compte est ignorée, sans réponse."
      try {
        await deps.linkStore.verifyCode(text.trim(), CHANNEL_NAME, channelUserId)
        identity = await resolveIdentity(channelUserId)
        await reply(
          channelId,
          ':white_check_mark: Compte lié. Vous pouvez maintenant utiliser les commandes.',
        )
      } catch {
        // Wrong/expired/nonexistent code from an unlinked identity: silence.
      }
      const handler = deps.getExternalHandler()
      if (handler !== undefined) await handler({ text, identity })
      return
    }

    const handler = deps.getExternalHandler()
    if (handler !== undefined) await handler({ text, identity })

    const result = await deps.router.route(text, identity)
    if (!result.shouldReply) return
    if (result.kind === 'forbidden') {
      await reply(channelId, ":no_entry: Vous n'avez pas la permission d'exécuter cette commande.")
    } else if (result.kind === 'unrecognized') {
      await reply(channelId, `Commande inconnue : ${result.commandName}`)
    }
  }

  return async function handleEnvelope(envelope: SlackSocketEnvelope): Promise<void> {
    if (envelope.type === 'events_api') {
      const payload = envelope.payload as SlackEventsApiPayload | undefined
      const event = payload?.event
      if (
        event?.type === 'message' &&
        event.bot_id === undefined &&
        event.text !== undefined &&
        event.user !== undefined &&
        event.channel !== undefined
      ) {
        await handleText(event.channel, event.user, event.text)
      }
      return
    }

    if (envelope.type === 'interactive') {
      const payload = envelope.payload as SlackBlockActionsPayload | undefined
      if (payload?.type !== 'block_actions') return
      const channelId = payload.channel?.id
      const channelUserId = payload.user.id
      const action = payload.actions[0]
      if (channelId === undefined || action?.action_id === undefined) return
      await handleText(channelId, channelUserId, action.value ?? action.action_id)
    }
  }
}
