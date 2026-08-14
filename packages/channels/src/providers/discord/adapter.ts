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
import { createDiscordClient, type DiscordClient, type DiscordClientConfig } from './client.js'
import { createDiscordGatewayClient, type DiscordGatewayClient } from './gateway.js'
import { createDiscordInboundHandler } from './inbound.js'
import { renderDiscordMessage } from './render.js'

const CHANNEL_NAME = 'discord'

/** `GUILD_MESSAGES | MESSAGE_CONTENT` — the minimum needed to read `MESSAGE_CREATE.content`; no more requested than this adapter actually uses. */
const DEFAULT_INTENTS = (1 << 9) | (1 << 15)

export interface DiscordLinkProof {
  readonly code: string
  readonly channelUserId: string
}

function isDiscordLinkProof(proof: unknown): proof is DiscordLinkProof {
  return (
    typeof proof === 'object' &&
    proof !== null &&
    typeof (proof as Partial<DiscordLinkProof>).code === 'string' &&
    typeof (proof as Partial<DiscordLinkProof>).channelUserId === 'string'
  )
}

export interface DiscordAdapterOptions extends DiscordClientConfig {
  readonly linkStore: ChannelLinkStore
  readonly router: CommandRouter
  readonly intents?: number
  readonly gatewayClient?: DiscordGatewayClient
}

/**
 * A live channel adapter beyond the generic interface: `start()`/`stop()`
 * manage the Gateway connection, which has no counterpart in
 * `ChannelAdapter` — same shape as `TelegramAdapter`'s polling lifecycle and
 * `SlackAdapter`'s Socket Mode lifecycle.
 */
export interface DiscordAdapter extends ChannelAdapter {
  update(id: MessageId, message: ChannelMessage): Promise<void>
  onInbound(handler: InboundHandler): void
  start(): Promise<void>
  stop(): void
}

/**
 * "Adaptateur Discord." The Gateway (a persistent WebSocket), not the
 * Interactions Endpoint URL webhook — Discord offers no polling REST
 * alternative for real-time messages (unlike Telegram's `getUpdates`), and
 * the webhook path needs a public HTTPS endpoint plus Ed25519 signature
 * verification this project has nowhere to receive yet (no plane of this
 * project is deployed publicly). The Gateway is Discord's own real,
 * officially-supported answer to "no public URL."
 */
export function createDiscordAdapter(options: DiscordAdapterOptions): DiscordAdapter {
  const client: DiscordClient = createDiscordClient(options)
  const gateway: DiscordGatewayClient =
    options.gatewayClient ??
    createDiscordGatewayClient({
      token: options.botToken,
      intents: options.intents ?? DEFAULT_INTENTS,
    })

  let inboundHandler: InboundHandler | undefined

  const handleDispatch = createDiscordInboundHandler({
    client,
    linkStore: options.linkStore,
    router: options.router,
    getExternalHandler: () => inboundHandler,
  })

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
      const rendered = renderDiscordMessage(message)
      const sent = await client.sendMessage({
        channelId: target.id,
        ...(rendered.content === undefined ? {} : { content: rendered.content }),
        ...(rendered.embeds.length > 0 ? { embeds: rendered.embeds } : {}),
        ...(rendered.components.length > 0 ? { components: rendered.components } : {}),
      })
      return `${sent.channelId}:${sent.messageId}`
    },

    async update(id: MessageId, message: ChannelMessage): Promise<void> {
      const [channelId, messageId] = id.split(':')
      if (channelId === undefined || messageId === undefined) {
        throw new CogentaError({
          code: 'CHANNEL_DISCORD_API_ERROR',
          message: `"${id}" is not a message id this adapter produced.`,
          hint: "Only pass a MessageId returned by this adapter's own send() to update().",
        })
      }
      const rendered = renderDiscordMessage(message)
      await client.updateMessage({
        channelId,
        messageId,
        ...(rendered.content === undefined ? {} : { content: rendered.content }),
        ...(rendered.embeds.length > 0 ? { embeds: rendered.embeds } : {}),
        ...(rendered.components.length > 0 ? { components: rendered.components } : {}),
      })
    },

    onInbound(handler: InboundHandler): void {
      inboundHandler = handler
    },

    async verifyIdentity(proof: unknown): Promise<ChannelIdentity> {
      if (!isDiscordLinkProof(proof)) {
        throw new CogentaError({
          code: 'CHANNEL_DISCORD_API_ERROR',
          message: 'Discord identity proof must be { code, channelUserId }.',
          hint: 'Pass the linking code submitted in the channel and the Discord user id it came from.',
        })
      }
      await options.linkStore.verifyCode(proof.code, CHANNEL_NAME, proof.channelUserId)
      return options.linkStore.resolveIdentity(CHANNEL_NAME, proof.channelUserId)
    },

    async start(): Promise<void> {
      await gateway.connect(handleDispatch)
    },

    stop(): void {
      gateway.disconnect()
    },
  }
}
