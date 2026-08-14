import type { ChannelIdentity, InboundHandler } from '../../adapter.js'
import type { CommandRouter } from '../../inbound/router.js'
import type { ChannelLinkStore } from '../../linking/store.js'
import type { TelegramClient, TelegramUpdate } from './client.js'

const CHANNEL_NAME = 'telegram'

const MARKDOWN_V2_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g
function escapePlainReply(text: string): string {
  return text.replace(MARKDOWN_V2_SPECIAL, (char) => `\\${char}`)
}

export interface TelegramInboundDeps {
  readonly client: TelegramClient
  readonly linkStore: ChannelLinkStore
  readonly router: CommandRouter
  /** The handler registered via the adapter's `onInbound()`, if any. */
  getExternalHandler(): InboundHandler | undefined
}

/**
 * The real routing/authorization wiring for one inbound Telegram update —
 * extracted from the adapter so it is directly testable without spinning
 * the real long-polling loop. Handles both a typed text command and a
 * button press (`callback_query`, whose `data` is itself a command string
 * rendered by `render.ts`) through the exact same `CommandRouter.route()`,
 * never a second, parallel authorization path.
 */
export function createTelegramInboundHandler(
  deps: TelegramInboundDeps,
): (update: TelegramUpdate) => Promise<void> {
  async function resolveIdentity(channelUserId: string): Promise<ChannelIdentity> {
    return deps.linkStore.resolveIdentity(CHANNEL_NAME, channelUserId)
  }

  async function reply(chatId: string, text: string): Promise<void> {
    await deps.client.sendMessage({ chat_id: chatId, text: escapePlainReply(text) })
  }

  async function handleText(chatId: string, channelUserId: string, text: string): Promise<void> {
    let identity = await resolveIdentity(channelUserId)

    if (identity.linkedUserId === null) {
      // An unlinked identity gets exactly one thing to try: the message AS
      // a linking code. Any other failure stays silent — "Une identité de
      // canal non liée à un compte est ignorée, sans réponse."
      try {
        await deps.linkStore.verifyCode(text.trim(), CHANNEL_NAME, channelUserId)
        identity = await resolveIdentity(channelUserId)
        await reply(chatId, '✅ Compte lié. Vous pouvez maintenant utiliser les commandes.')
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
      await reply(chatId, "🚫 Vous n'avez pas la permission d'exécuter cette commande.")
    } else if (result.kind === 'unrecognized') {
      await reply(chatId, `Commande inconnue : ${result.commandName}`)
    }
  }

  return async function handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.message?.text !== undefined && update.message.from !== undefined) {
      await handleText(
        String(update.message.chat.id),
        String(update.message.from.id),
        update.message.text,
      )
      return
    }

    if (update.callback_query !== undefined) {
      const query = update.callback_query
      const chatId = query.message === undefined ? undefined : String(query.message.chat.id)
      const channelUserId = String(query.from.id)
      const data = query.data ?? ''

      if (chatId !== undefined && data.length > 0) {
        await handleText(chatId, channelUserId, data)
      }
      // Dismiss the button's loading state regardless of outcome — a UI
      // affordance, not a disclosure.
      await deps.client.answerCallbackQuery(query.id)
    }
  }
}
