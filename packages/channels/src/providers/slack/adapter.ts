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
import { createSlackClient, type SlackClient, type SlackClientConfig } from './client.js'
import { createSlackInboundHandler } from './inbound.js'
import { renderSlackMessage } from './render.js'
import { createSlackSocketClient, type SlackSocketClient } from './socket.js'

const CHANNEL_NAME = 'slack'

export interface SlackLinkProof {
  readonly code: string
  readonly channelUserId: string
}

function isSlackLinkProof(proof: unknown): proof is SlackLinkProof {
  return (
    typeof proof === 'object' &&
    proof !== null &&
    typeof (proof as Partial<SlackLinkProof>).code === 'string' &&
    typeof (proof as Partial<SlackLinkProof>).channelUserId === 'string'
  )
}

export interface SlackAdapterOptions extends SlackClientConfig {
  readonly appToken: string
  readonly linkStore: ChannelLinkStore
  readonly router: CommandRouter
  readonly socketClient?: SlackSocketClient
}

/**
 * A live channel adapter beyond the generic interface: `start()`/`stop()`
 * manage the Socket Mode connection, which has no counterpart in
 * `ChannelAdapter` — same shape as `TelegramAdapter`'s polling lifecycle.
 */
export interface SlackAdapter extends ChannelAdapter {
  update(id: MessageId, message: ChannelMessage): Promise<void>
  onInbound(handler: InboundHandler): void
  start(): Promise<void>
  stop(): void
}

/**
 * "Adaptateur Slack." Socket Mode, not the Events API webhook — same
 * reasoning as Telegram's long-polling choice (`providers/telegram/adapter.ts`):
 * no plane of this project is deployed publicly yet, and Socket Mode is
 * Slack's own real, officially-supported answer to "no public URL,"
 * requiring no signature-verification infrastructure to half-build.
 */
export function createSlackAdapter(options: SlackAdapterOptions): SlackAdapter {
  const client: SlackClient = createSlackClient(options)
  const socket: SlackSocketClient =
    options.socketClient ??
    createSlackSocketClient({
      appToken: options.appToken,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    })

  let inboundHandler: InboundHandler | undefined

  const handleEnvelope = createSlackInboundHandler({
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
      const rendered = renderSlackMessage(message)
      const sent = await client.postMessage({
        channel: target.id,
        text: rendered.text,
        ...(rendered.blocks.length > 0 ? { blocks: rendered.blocks } : {}),
      })
      return `${sent.channel}:${sent.ts}`
    },

    async update(id: MessageId, message: ChannelMessage): Promise<void> {
      const [channel, ts] = id.split(':')
      if (channel === undefined || ts === undefined) {
        throw new CogentaError({
          code: 'CHANNEL_SLACK_API_ERROR',
          message: `"${id}" is not a message id this adapter produced.`,
          hint: "Only pass a MessageId returned by this adapter's own send() to update().",
        })
      }
      const rendered = renderSlackMessage(message)
      await client.updateMessage({
        channel,
        ts,
        text: rendered.text,
        ...(rendered.blocks.length > 0 ? { blocks: rendered.blocks } : {}),
      })
    },

    onInbound(handler: InboundHandler): void {
      inboundHandler = handler
    },

    async verifyIdentity(proof: unknown): Promise<ChannelIdentity> {
      if (!isSlackLinkProof(proof)) {
        throw new CogentaError({
          code: 'CHANNEL_SLACK_API_ERROR',
          message: 'Slack identity proof must be { code, channelUserId }.',
          hint: 'Pass the linking code submitted in the channel and the Slack user id it came from.',
        })
      }
      await options.linkStore.verifyCode(proof.code, CHANNEL_NAME, proof.channelUserId)
      return options.linkStore.resolveIdentity(CHANNEL_NAME, proof.channelUserId)
    },

    async start(): Promise<void> {
      await socket.connect(handleEnvelope)
    },

    stop(): void {
      socket.disconnect()
    },
  }
}
