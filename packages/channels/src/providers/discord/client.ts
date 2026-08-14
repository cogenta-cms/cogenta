import { CogentaError } from '@cogenta/core'

/**
 * A minimal, hand-typed client for the Discord REST methods this adapter
 * needs to send/edit a message and acknowledge a component interaction —
 * plain HTTPS/JSON, same zero-dependency reasoning as
 * `providers/telegram/client.ts` and `providers/slack/client.ts`.
 */

export interface DiscordEmbedField {
  readonly name: string
  readonly value: string
  readonly inline?: boolean
}

export interface DiscordEmbed {
  readonly title?: string
  readonly description?: string
  readonly url?: string
  readonly color?: number
  readonly fields?: readonly DiscordEmbedField[]
}

export interface DiscordButtonComponent {
  readonly type: 2
  readonly style: 1
  readonly label: string
  readonly custom_id: string
}

export interface DiscordActionRow {
  readonly type: 1
  readonly components: readonly DiscordButtonComponent[]
}

export interface DiscordSendMessageParams {
  readonly channelId: string
  readonly content?: string
  readonly embeds?: readonly DiscordEmbed[]
  readonly components?: readonly DiscordActionRow[]
}

export interface DiscordUpdateMessageParams {
  readonly channelId: string
  readonly messageId: string
  readonly content?: string
  readonly embeds?: readonly DiscordEmbed[]
  readonly components?: readonly DiscordActionRow[]
}

export interface DiscordMessageResult {
  readonly channelId: string
  readonly messageId: string
}

interface DiscordMessageResponse {
  readonly id: string
  readonly channel_id: string
}

interface DiscordErrorResponse {
  readonly message: string
  readonly code?: number
}

/** Discord's 429 body — `retry_after` is a float number of SECONDS, unlike Telegram's integer JSON field of the same name. */
interface DiscordRateLimitResponse {
  readonly retry_after: number
  readonly global?: boolean
}

export interface DiscordClientConfig {
  readonly botToken: string
  /** Overridable for tests; defaults to the real Discord API host. */
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  /** Overridable for tests, so a 429 retry doesn't really wait. */
  readonly sleepImpl?: (ms: number) => Promise<void>
}

export interface DiscordClient {
  sendMessage(params: DiscordSendMessageParams): Promise<DiscordMessageResult>
  updateMessage(params: DiscordUpdateMessageParams): Promise<void>
  /**
   * Discord requires an interaction be acknowledged within 3 seconds or the
   * component shows "This interaction failed" to the user — a deferred
   * update (type 6, `DEFERRED_UPDATE_MESSAGE`) acks with no visible change;
   * any real reply this adapter needs to send goes through a normal
   * `sendMessage` call afterwards, same shape as Telegram/Slack's reply flow.
   */
  acknowledgeInteraction(interactionId: string, interactionToken: string): Promise<void>
}

const DEFAULT_BASE_URL = 'https://discord.com/api/v10'
const DEFERRED_UPDATE_MESSAGE = 6

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createDiscordClient(config: DiscordClientConfig): DiscordClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl = config.fetchImpl ?? fetch
  const sleepImpl = config.sleepImpl ?? defaultSleep

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    expectBody = true,
  ): Promise<T | undefined> {
    for (;;) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bot ${config.botToken}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })

      if (response.status === 429) {
        const rateLimit = (await response.json()) as DiscordRateLimitResponse
        const retryAfterSeconds = Number.isFinite(rateLimit.retry_after) ? rateLimit.retry_after : 1
        await sleepImpl(retryAfterSeconds * 1000)
        continue
      }

      if (!response.ok) {
        const error = (await response.json()) as DiscordErrorResponse
        throw new CogentaError({
          code: 'CHANNEL_DISCORD_API_ERROR',
          message: `Discord API call "${method} ${path}" failed: ${error.message}`,
          hint: 'Check the bot token, that it was invited to the guild, and that the channel/message this call references still exists.',
          details: { method, path, discordCode: error.code, error: error.message },
        })
      }

      if (!expectBody) return undefined
      return (await response.json()) as T
    }
  }

  return {
    async sendMessage(params) {
      const result = await call<DiscordMessageResponse>(
        'POST',
        `/channels/${params.channelId}/messages`,
        {
          content: params.content,
          embeds: params.embeds,
          components: params.components,
        },
      )
      if (result === undefined) {
        throw new CogentaError({
          code: 'CHANNEL_DISCORD_API_ERROR',
          message: 'Discord did not return the sent message.',
          hint: 'This should not happen — the send-message endpoint always returns the created message.',
        })
      }
      return { channelId: result.channel_id, messageId: result.id }
    },

    async updateMessage(params) {
      await call(
        'PATCH',
        `/channels/${params.channelId}/messages/${params.messageId}`,
        { content: params.content, embeds: params.embeds, components: params.components },
        false,
      )
    },

    async acknowledgeInteraction(interactionId, interactionToken) {
      await call(
        'POST',
        `/interactions/${interactionId}/${interactionToken}/callback`,
        { type: DEFERRED_UPDATE_MESSAGE },
        false,
      )
    },
  }
}
