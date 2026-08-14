import { CogentaError } from '@cogenta/core'
import type {
  ChannelAdapter,
  ChannelIdentity,
  ChannelMessage,
  ChannelTarget,
  InboundHandler,
  MessageId,
} from '../../adapter.js'
import type { CommandRouter } from '../../inbound/router.js'
import type { ChannelLinkStore } from '../../linking/store.js'
import { createTelegramClient, type TelegramClient, type TelegramClientConfig } from './client.js'
import { createTelegramInboundHandler } from './inbound.js'
import { renderTelegramMessage } from './render.js'

const CHANNEL_NAME = 'telegram'
const DEFAULT_POLL_TIMEOUT_SECONDS = 30

export interface TelegramLinkProof {
  readonly code: string
  readonly channelUserId: string
}

function isTelegramLinkProof(proof: unknown): proof is TelegramLinkProof {
  return (
    typeof proof === 'object' &&
    proof !== null &&
    typeof (proof as Partial<TelegramLinkProof>).code === 'string' &&
    typeof (proof as Partial<TelegramLinkProof>).channelUserId === 'string'
  )
}

export interface TelegramAdapterOptions extends TelegramClientConfig {
  readonly linkStore: ChannelLinkStore
  readonly router: CommandRouter
  readonly pollTimeoutSeconds?: number
}

/**
 * A live channel adapter beyond the generic interface: `start()`/`stop()`
 * manage the long-polling loop, which has no counterpart in `ChannelAdapter`
 * (a webhook-based provider would have no need for it) — platform-specific
 * lifecycle concerns live on the concrete adapter, not the shared interface.
 */
export interface TelegramAdapter extends ChannelAdapter {
  // Narrowed from `ChannelAdapter`'s optional shape — this adapter always
  // implements both.
  update(id: MessageId, message: ChannelMessage): Promise<void>
  onInbound(handler: InboundHandler): void
  start(): void
  stop(): Promise<void>
}

/**
 * "Telegram en premier, complet." Long-polling (`getUpdates`), not a
 * webhook: a webhook needs a real public HTTPS endpoint and Telegram's own
 * `X-Telegram-Bot-Api-Secret-Token` signature verification, and no plane of
 * this project is deployed publicly yet (L9 task 12's scoping). Polling
 * works unchanged wherever `cogenta serve` already runs — locally, on a
 * VPS, in CI — with no exposure and no signing infrastructure to half-build.
 */
export function createTelegramAdapter(options: TelegramAdapterOptions): TelegramAdapter {
  const client: TelegramClient = createTelegramClient(options)
  const pollTimeoutSeconds = options.pollTimeoutSeconds ?? DEFAULT_POLL_TIMEOUT_SECONDS

  let inboundHandler: InboundHandler | undefined
  let polling = false
  let pollLoop: Promise<void> | undefined
  let updateOffset = 0

  const handleUpdate = createTelegramInboundHandler({
    client,
    linkStore: options.linkStore,
    router: options.router,
    getExternalHandler: () => inboundHandler,
  })

  async function pollOnce(): Promise<void> {
    const updates = await client.getUpdates(updateOffset, pollTimeoutSeconds)
    for (const update of updates) {
      updateOffset = update.update_id + 1
      await handleUpdate(update)
    }
  }

  return {
    name: CHANNEL_NAME,
    capabilities: {
      richText: true,
      buttons: true,
      threads: false,
      attachments: false,
      inbound: true,
    },

    async send(target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      const rendered = renderTelegramMessage(message)
      const sent = await client.sendMessage({
        chat_id: target.id,
        text: rendered.text,
        parse_mode: 'MarkdownV2',
        ...(rendered.replyMarkup === undefined ? {} : { reply_markup: rendered.replyMarkup }),
      })
      return `${sent.chat.id}:${sent.message_id}`
    },

    async update(id: MessageId, message: ChannelMessage): Promise<void> {
      const [chatId, messageIdPart] = id.split(':')
      if (chatId === undefined || messageIdPart === undefined) {
        throw new CogentaError({
          code: 'CHANNEL_TELEGRAM_API_ERROR',
          message: `"${id}" is not a message id this adapter produced.`,
          hint: "Only pass a MessageId returned by this adapter's own send() to update().",
        })
      }
      const rendered = renderTelegramMessage(message)
      await client.editMessageText({
        chat_id: chatId,
        message_id: Number(messageIdPart),
        text: rendered.text,
        parse_mode: 'MarkdownV2',
        ...(rendered.replyMarkup === undefined ? {} : { reply_markup: rendered.replyMarkup }),
      })
    },

    onInbound(handler: InboundHandler): void {
      inboundHandler = handler
    },

    async verifyIdentity(proof: unknown): Promise<ChannelIdentity> {
      if (!isTelegramLinkProof(proof)) {
        throw new CogentaError({
          code: 'CHANNEL_TELEGRAM_API_ERROR',
          message: 'Telegram identity proof must be { code, channelUserId }.',
          hint: 'Pass the linking code submitted in the channel and the Telegram user id it came from.',
        })
      }
      await options.linkStore.verifyCode(proof.code, CHANNEL_NAME, proof.channelUserId)
      return options.linkStore.resolveIdentity(CHANNEL_NAME, proof.channelUserId)
    },

    start(): void {
      if (polling) return
      polling = true
      pollLoop = (async () => {
        while (polling) {
          await pollOnce()
        }
      })()
    },

    async stop(): Promise<void> {
      polling = false
      await pollLoop
      pollLoop = undefined
    },
  }
}
