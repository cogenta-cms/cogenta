import type { ChannelIdentity, InboundHandler } from '../../adapter.js'
import type { CommandRouter } from '../../inbound/router.js'
import type { ChannelLinkStore } from '../../linking/store.js'
import type { DiscordClient } from './client.js'
import type { DiscordDispatchEvent } from './gateway.js'

const CHANNEL_NAME = 'discord'
const MESSAGE_COMPONENT = 3

interface DiscordMessageCreateData {
  readonly channel_id: string
  readonly content: string
  readonly author: { readonly id: string; readonly bot?: boolean }
}

interface DiscordInteractionCreateData {
  readonly id: string
  readonly token: string
  readonly type: number
  readonly channel_id?: string
  readonly member?: { readonly user: { readonly id: string } }
  readonly user?: { readonly id: string }
  readonly data?: { readonly custom_id?: string }
}

export interface DiscordInboundDeps {
  readonly client: DiscordClient
  readonly linkStore: ChannelLinkStore
  readonly router: CommandRouter
  /** The handler registered via the adapter's `onInbound()`, if any. */
  getExternalHandler(): InboundHandler | undefined
}

/**
 * The real routing/authorization wiring for one Discord dispatch event —
 * extracted from the adapter, same shape as `providers/slack/inbound.ts`.
 * Handles both a typed message (`MESSAGE_CREATE`) and a button press
 * (`INTERACTION_CREATE` with `type: MESSAGE_COMPONENT`, whose `custom_id` is
 * itself a command string rendered by `render.ts`) through the exact same
 * `CommandRouter.route()`, never a second, parallel authorization path.
 */
export function createDiscordInboundHandler(
  deps: DiscordInboundDeps,
): (event: DiscordDispatchEvent) => Promise<void> {
  async function resolveIdentity(channelUserId: string): Promise<ChannelIdentity> {
    return deps.linkStore.resolveIdentity(CHANNEL_NAME, channelUserId)
  }

  async function reply(channelId: string, content: string): Promise<void> {
    await deps.client.sendMessage({ channelId, content })
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
        await reply(channelId, '✅ Compte lié. Vous pouvez maintenant utiliser les commandes.')
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
      await reply(channelId, "⛔ Vous n'avez pas la permission d'exécuter cette commande.")
    } else if (result.kind === 'unrecognized') {
      await reply(channelId, `Commande inconnue : ${result.commandName}`)
    }
  }

  return async function handleDispatch(event: DiscordDispatchEvent): Promise<void> {
    if (event.type === 'MESSAGE_CREATE') {
      const data = event.data as DiscordMessageCreateData
      if (data.author.bot === true) return
      await handleText(data.channel_id, data.author.id, data.content)
      return
    }

    if (event.type === 'INTERACTION_CREATE') {
      const data = event.data as DiscordInteractionCreateData
      if (data.type !== MESSAGE_COMPONENT) return
      const channelUserId = data.member?.user.id ?? data.user?.id
      const customId = data.data?.custom_id
      if (channelUserId === undefined || customId === undefined || data.channel_id === undefined) {
        return
      }
      // Discord requires an ack within 3s or the component shows "This
      // interaction failed" — a deferred update, no visible change; any
      // real reply is a normal follow-up message, same as the text path.
      await deps.client.acknowledgeInteraction(data.id, data.token)
      await handleText(data.channel_id, channelUserId, customId)
    }
  }
}
