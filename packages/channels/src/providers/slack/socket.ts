import { CogentaError } from '@cogenta/core'

/**
 * Socket Mode, not a webhook — Slack's own equivalent of Telegram's
 * long-polling choice (`providers/telegram/adapter.ts`): a persistent
 * outbound WebSocket connection to Slack, no public HTTPS endpoint or
 * request-signature verification to half-build, works unchanged wherever
 * `cogenta serve` already runs. Node's built-in `WebSocket` global (stable
 * since Node 22, this package's minimum) means no dependency is needed for
 * the transport itself.
 */

export interface SlackSocketEnvelope {
  readonly type: string
  readonly envelope_id?: string
  readonly payload?: unknown
  readonly reason?: string
}

export interface SlackSocketClientConfig {
  readonly appToken: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  /** Defaults to the global `WebSocket` (Node's built-in implementation). */
  readonly webSocketImpl?: typeof WebSocket
}

export interface SlackSocketClient {
  /** Opens the connection and delivers every envelope Slack sends; acks each one automatically once `onEnvelope` resolves. Resolves once the initial connection is established. */
  connect(onEnvelope: (envelope: SlackSocketEnvelope) => Promise<void>): Promise<void>
  disconnect(): void
}

const DEFAULT_BASE_URL = 'https://slack.com/api'

interface OpenConnectionResult {
  readonly ok: true
  readonly url: string
}

async function openConnection(
  fetchImpl: typeof fetch,
  baseUrl: string,
  appToken: string,
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/apps.connections.open`, {
    method: 'POST',
    headers: { authorization: `Bearer ${appToken}` },
  })
  const json = (await response.json()) as
    | OpenConnectionResult
    | { readonly ok: false; readonly error: string }
  if (!json.ok) {
    throw new CogentaError({
      code: 'CHANNEL_SLACK_API_ERROR',
      message: `Slack Socket Mode connection failed: ${json.error}`,
      hint: 'Check the app-level token (xapp-...) has the connections:write scope.',
      details: { error: json.error },
    })
  }
  return json.url
}

/**
 * A `disconnect` envelope (`reason: 'refresh_requested' | 'warning' | ...`)
 * means Slack is about to close this socket — reconnect once, exactly like
 * Telegram's poll loop keeps calling `getUpdates` while `polling` is true.
 */
export function createSlackSocketClient(config: SlackSocketClientConfig): SlackSocketClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl = config.fetchImpl ?? fetch
  const WebSocketImpl = config.webSocketImpl ?? WebSocket

  let socket: WebSocket | undefined
  let connected = false

  function ack(envelopeId: string | undefined): void {
    if (envelopeId === undefined || socket === undefined) return
    socket.send(JSON.stringify({ envelope_id: envelopeId }))
  }

  async function openSocket(
    onEnvelope: (envelope: SlackSocketEnvelope) => Promise<void>,
  ): Promise<void> {
    const url = await openConnection(fetchImpl, baseUrl, config.appToken)
    const ws = new WebSocketImpl(url)
    socket = ws

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve())
      ws.addEventListener('error', () =>
        reject(new Error('Slack Socket Mode connection failed to open.')),
      )
    })

    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data)
      const envelope = JSON.parse(raw) as SlackSocketEnvelope
      void (async () => {
        if (envelope.type === 'disconnect') {
          ws.close()
          if (connected) await openSocket(onEnvelope)
          return
        }
        await onEnvelope(envelope)
        ack(envelope.envelope_id)
      })()
    })
  }

  return {
    async connect(onEnvelope) {
      connected = true
      await openSocket(onEnvelope)
    },

    disconnect() {
      connected = false
      socket?.close()
      socket = undefined
    },
  }
}
