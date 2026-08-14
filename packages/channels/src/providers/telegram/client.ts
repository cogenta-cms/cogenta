import { CogentaError } from '@cogenta/core'

/**
 * A minimal, hand-typed client for the four Telegram Bot API methods this
 * adapter needs. Telegram's Bot API is plain HTTPS/JSON — no official SDK
 * is required, and this codebase's established precedent (`@cogenta/import`'s
 * hand-rolled WXR parser, `@cogenta/mcp`'s hand-rolled JSON-RPC subset)
 * favours a small, zero-dependency client over a general-purpose SDK for an
 * API this simple, rather than adding a new direct dependency for four HTTP
 * calls.
 */

export interface TelegramInlineButton {
  readonly text: string
  readonly callback_data: string
}

export interface TelegramReplyMarkup {
  readonly inline_keyboard: readonly (readonly TelegramInlineButton[])[]
}

export interface TelegramSendMessageParams {
  readonly chat_id: string
  readonly text: string
  readonly parse_mode?: 'MarkdownV2'
  readonly reply_markup?: TelegramReplyMarkup
}

export interface TelegramEditMessageParams {
  readonly chat_id: string
  readonly message_id: number
  readonly text: string
  readonly parse_mode?: 'MarkdownV2'
  readonly reply_markup?: TelegramReplyMarkup
}

export interface TelegramMessage {
  readonly message_id: number
  readonly chat: { readonly id: number }
}

export interface TelegramUser {
  readonly id: number
}

export interface TelegramIncomingMessage {
  readonly message_id: number
  readonly chat: { readonly id: number }
  readonly from?: TelegramUser
  readonly text?: string
}

export interface TelegramCallbackQuery {
  readonly id: string
  readonly from: TelegramUser
  readonly message?: TelegramIncomingMessage
  readonly data?: string
}

export interface TelegramUpdate {
  readonly update_id: number
  readonly message?: TelegramIncomingMessage
  readonly callback_query?: TelegramCallbackQuery
}

interface TelegramApiSuccess<T> {
  readonly ok: true
  readonly result: T
}

interface TelegramApiFailure {
  readonly ok: false
  readonly error_code: number
  readonly description: string
  readonly parameters?: { readonly retry_after?: number }
}

type TelegramApiResponse<T> = TelegramApiSuccess<T> | TelegramApiFailure

export interface TelegramClientConfig {
  readonly token: string
  /** Overridable for tests; defaults to the real Telegram API host. */
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  /** Overridable for tests, so a 429 retry doesn't really wait. */
  readonly sleepImpl?: (ms: number) => Promise<void>
}

export interface TelegramClient {
  sendMessage(params: TelegramSendMessageParams): Promise<TelegramMessage>
  editMessageText(params: TelegramEditMessageParams): Promise<void>
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>
  getUpdates(offset: number, timeoutSeconds: number): Promise<readonly TelegramUpdate[]>
}

const DEFAULT_BASE_URL = 'https://api.telegram.org'

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * `createTelegramClient` retries a rate-limited call using Telegram's own
 * `retry_after` value (seconds) rather than a guessed backoff — "Prévoir la
 * file, le backoff et le regroupement dès le premier adaptateur" (lot doc).
 */
export function createTelegramClient(config: TelegramClientConfig): TelegramClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl = config.fetchImpl ?? fetch
  const sleepImpl = config.sleepImpl ?? defaultSleep

  async function call<T>(method: string, body: unknown): Promise<T> {
    for (;;) {
      const response = await fetchImpl(`${baseUrl}/bot${config.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await response.json()) as TelegramApiResponse<T>

      if (response.status === 429 && !json.ok) {
        const retryAfterSeconds = json.parameters?.retry_after ?? 1
        await sleepImpl(retryAfterSeconds * 1000)
        continue
      }

      if (!json.ok) {
        throw new CogentaError({
          code: 'CHANNEL_TELEGRAM_API_ERROR',
          message: `Telegram API call "${method}" failed: ${json.description}`,
          hint: 'Check the bot token, and that the chat or message this call references still exists.',
          details: { method, errorCode: json.error_code },
        })
      }

      return json.result
    }
  }

  return {
    sendMessage: (params) => call<TelegramMessage>('sendMessage', params),

    async editMessageText(params) {
      await call<TelegramMessage | true>('editMessageText', params)
    },

    async answerCallbackQuery(callbackQueryId, text) {
      await call<true>('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text === undefined ? {} : { text }),
      })
    },

    getUpdates: (offset, timeoutSeconds) =>
      call<readonly TelegramUpdate[]>('getUpdates', { offset, timeout: timeoutSeconds }),
  }
}
