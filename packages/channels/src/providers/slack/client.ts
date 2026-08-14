import { CogentaError } from '@cogenta/core'

/**
 * A minimal, hand-typed client for the two Slack Web API methods this
 * adapter needs to send/edit a message — plain HTTPS/JSON, same
 * zero-dependency reasoning as `providers/telegram/client.ts`.
 */

export interface SlackBlock {
  readonly type: string
  readonly [key: string]: unknown
}

export interface SlackPostMessageParams {
  readonly channel: string
  readonly text: string
  readonly blocks?: readonly SlackBlock[]
}

export interface SlackUpdateMessageParams {
  readonly channel: string
  readonly ts: string
  readonly text: string
  readonly blocks?: readonly SlackBlock[]
}

export interface SlackMessageResult {
  readonly channel: string
  readonly ts: string
}

interface SlackApiSuccess {
  readonly ok: true
  readonly channel: string
  readonly ts: string
}

interface SlackApiFailure {
  readonly ok: false
  readonly error: string
}

type SlackApiResponse = SlackApiSuccess | SlackApiFailure

export interface SlackClientConfig {
  readonly botToken: string
  /** Overridable for tests; defaults to the real Slack API host. */
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  /** Overridable for tests, so a 429 retry doesn't really wait. */
  readonly sleepImpl?: (ms: number) => Promise<void>
}

export interface SlackClient {
  postMessage(params: SlackPostMessageParams): Promise<SlackMessageResult>
  updateMessage(params: SlackUpdateMessageParams): Promise<void>
}

const DEFAULT_BASE_URL = 'https://slack.com/api'

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Slack's rate-limit signal is an HTTP `Retry-After` header (seconds) on a
 * 429, not a JSON body field like Telegram's `retry_after` — same "wait the
 * value the platform actually gave us" principle either way (`## Pièges
 * connus`: "Prévoir la file, le backoff et le regroupement dès le premier
 * adaptateur").
 */
export function createSlackClient(config: SlackClientConfig): SlackClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl = config.fetchImpl ?? fetch
  const sleepImpl = config.sleepImpl ?? defaultSleep

  async function call(method: string, body: unknown): Promise<SlackApiSuccess> {
    for (;;) {
      const response = await fetchImpl(`${baseUrl}/${method}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${config.botToken}`,
        },
        body: JSON.stringify(body),
      })

      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '1')
        await sleepImpl((Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 1) * 1000)
        continue
      }

      const json = (await response.json()) as SlackApiResponse
      if (!json.ok) {
        throw new CogentaError({
          code: 'CHANNEL_SLACK_API_ERROR',
          message: `Slack API call "${method}" failed: ${json.error}`,
          hint: 'Check the bot token, scopes, and that the channel this call references still exists.',
          details: { method, error: json.error },
        })
      }
      return json
    }
  }

  return {
    async postMessage(params) {
      const result = await call('chat.postMessage', params)
      return { channel: result.channel, ts: result.ts }
    },

    async updateMessage(params) {
      await call('chat.update', params)
    },
  }
}
