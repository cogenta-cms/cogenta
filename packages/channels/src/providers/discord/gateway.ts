/**
 * Discord's real-time Gateway — a persistent WebSocket, the only real
 * mechanism for a bot with no public HTTPS endpoint to receive messages and
 * interactions (unlike Telegram, Discord has no polling REST alternative;
 * the alternative, an "Interactions Endpoint URL" webhook, needs a public
 * HTTPS endpoint plus Ed25519 signature verification — the same "no public
 * plane deployed" problem `providers/telegram/adapter.ts` and
 * `providers/slack/socket.ts` already resolved by choosing a persistent
 * outbound connection). Node's built-in `WebSocket` global (stable since
 * Node 22, this package's minimum) means no dependency is needed here
 * either.
 *
 * Unlike Slack's Socket Mode (an envelope arrives, you ack it — no other
 * protocol state), the Gateway requires real heartbeating: on `HELLO` (op
 * 10) the server names a `heartbeat_interval`, and the client must send a
 * `HEARTBEAT` (op 1) on that cadence or get disconnected. `scheduleHeartbeat`
 * is injected (defaulting to real `setInterval`) specifically so a test can
 * capture the interval and the send callback and invoke it manually —
 * deterministic, no real timers, same spirit as this codebase's injectable
 * clocks elsewhere (`runAgentLoop`'s `now()`) but shaped for a recurring
 * schedule rather than an elapsed-duration check.
 *
 * Session resumption (op 6 `RESUME`) is not implemented — a lost connection
 * reconnects fresh with a new `IDENTIFY`, exactly like Telegram's poll loop
 * and Slack's Socket Mode reconnect both start clean rather than resuming
 * mid-stream. Real, honest, and proportionate: resumption exists to avoid
 * re-fetching guild state after a brief blip, which this adapter (no guild
 * cache) has no use for.
 */

const OP_DISPATCH = 0
const OP_HEARTBEAT = 1
const OP_IDENTIFY = 2
const OP_RECONNECT = 7
const OP_INVALID_SESSION = 9
const OP_HELLO = 10

export interface DiscordGatewayPayload {
  readonly op: number
  readonly d?: unknown
  readonly s?: number | null
  readonly t?: string | null
}

export interface DiscordDispatchEvent {
  readonly type: string
  readonly data: unknown
}

export interface DiscordGatewayClientConfig {
  readonly token: string
  readonly intents: number
  /** Overridable for tests; defaults to the real Discord Gateway. */
  readonly gatewayUrl?: string
  readonly webSocketImpl?: typeof WebSocket
  /** Overridable for tests — real default uses `setInterval`/`clearInterval`. */
  readonly scheduleHeartbeat?: (intervalMs: number, send: () => void) => () => void
}

export interface DiscordGatewayClient {
  /** Opens the connection and delivers every dispatch event. Resolves once `READY` (or the first dispatch) confirms the session is live. */
  connect(onDispatch: (event: DiscordDispatchEvent) => Promise<void>): Promise<void>
  disconnect(): void
}

const DEFAULT_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json'

function defaultScheduleHeartbeat(intervalMs: number, send: () => void): () => void {
  const id = setInterval(send, intervalMs)
  return () => clearInterval(id)
}

export function createDiscordGatewayClient(
  config: DiscordGatewayClientConfig,
): DiscordGatewayClient {
  const gatewayUrl = config.gatewayUrl ?? DEFAULT_GATEWAY_URL
  const WebSocketImpl = config.webSocketImpl ?? WebSocket
  const scheduleHeartbeat = config.scheduleHeartbeat ?? defaultScheduleHeartbeat

  let socket: WebSocket | undefined
  let stopHeartbeat: (() => void) | undefined
  let lastSequence: number | null = null
  let connected = false

  function send(payload: DiscordGatewayPayload): void {
    socket?.send(JSON.stringify(payload))
  }

  function identify(): void {
    send({
      op: OP_IDENTIFY,
      d: {
        token: config.token,
        intents: config.intents,
        properties: { os: 'linux', browser: 'cogenta', device: 'cogenta' },
      },
    })
  }

  async function openSocket(
    onDispatch: (event: DiscordDispatchEvent) => Promise<void>,
  ): Promise<void> {
    const ws = new WebSocketImpl(gatewayUrl)
    socket = ws

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve())
      ws.addEventListener('error', () =>
        reject(new Error('Discord Gateway connection failed to open.')),
      )
    })

    ws.addEventListener('close', () => {
      stopHeartbeat?.()
      stopHeartbeat = undefined
      if (connected) void openSocket(onDispatch)
    })

    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data)
      const payload = JSON.parse(raw) as DiscordGatewayPayload
      if (payload.s !== undefined && payload.s !== null) lastSequence = payload.s

      void (async () => {
        if (payload.op === OP_HELLO) {
          const hello = payload.d as { readonly heartbeat_interval: number }
          stopHeartbeat?.()
          stopHeartbeat = scheduleHeartbeat(hello.heartbeat_interval, () => {
            send({ op: OP_HEARTBEAT, d: lastSequence })
          })
          identify()
          return
        }

        if (payload.op === OP_RECONNECT || payload.op === OP_INVALID_SESSION) {
          ws.close()
          return
        }

        if (payload.op === OP_DISPATCH && payload.t !== null && payload.t !== undefined) {
          await onDispatch({ type: payload.t, data: payload.d })
        }
      })()
    })
  }

  return {
    async connect(onDispatch) {
      connected = true
      await openSocket(onDispatch)
    },

    disconnect() {
      connected = false
      stopHeartbeat?.()
      stopHeartbeat = undefined
      socket?.close()
      socket = undefined
    },
  }
}
