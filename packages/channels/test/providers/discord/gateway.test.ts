import { describe, expect, it } from 'vitest'
import { createDiscordGatewayClient } from '../../../src/providers/discord/gateway.js'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  readonly sent: string[] = []
  closed = false
  private listeners: Record<string, ((event: unknown) => void)[]> = {}

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener]
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.emit('close')
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners[type] ?? []) listener(event)
  }
}

async function waitForSocket(index: number): Promise<FakeWebSocket> {
  for (let i = 0; i < 50; i++) {
    const socket = FakeWebSocket.instances[index]
    if (socket !== undefined) return socket
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`No FakeWebSocket instance at index ${index} after waiting.`)
}

/** A deterministic heartbeat scheduler: captures the real interval Discord asked for and the send callback, and lets a test invoke it manually rather than waiting on a real timer. */
function fakeScheduler(): {
  readonly schedule: (intervalMs: number, send: () => void) => () => void
  intervalMs: number | undefined
  cancelled: boolean
  fire(): void
} {
  const state: {
    intervalMs: number | undefined
    cancelled: boolean
    send: (() => void) | undefined
  } = { intervalMs: undefined, cancelled: false, send: undefined }

  return {
    schedule(intervalMs, send) {
      state.intervalMs = intervalMs
      state.cancelled = false
      state.send = send
      return () => {
        state.cancelled = true
      }
    },
    get intervalMs() {
      return state.intervalMs
    },
    get cancelled() {
      return state.cancelled
    },
    fire() {
      state.send?.()
    },
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createDiscordGatewayClient', () => {
  it('connects, identifies with the real token and intents after HELLO', async () => {
    FakeWebSocket.instances = []
    const scheduler = fakeScheduler()
    const client = createDiscordGatewayClient({
      token: 'tok',
      intents: 42,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      scheduleHeartbeat: scheduler.schedule,
    })

    const connectPromise = client.connect(async () => {})
    const socket = await waitForSocket(0)
    socket.emit('open')
    await connectPromise
    socket.emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 5000 } }) })
    await flush()

    expect(socket.url).toContain('gateway.discord.gg')
    const identify = JSON.parse(socket.sent[0] ?? '{}')
    expect(identify).toEqual({
      op: 2,
      d: { token: 'tok', intents: 42, properties: expect.any(Object) },
    })
    expect(scheduler.intervalMs).toBe(5000)
  })

  it('sends a real HEARTBEAT (op 1) with the last sequence when the scheduler fires', async () => {
    FakeWebSocket.instances = []
    const scheduler = fakeScheduler()
    const client = createDiscordGatewayClient({
      token: 'tok',
      intents: 1,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      scheduleHeartbeat: scheduler.schedule,
    })

    const connectPromise = client.connect(async () => {})
    const socket = await waitForSocket(0)
    socket.emit('open')
    await connectPromise
    socket.emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) })
    await flush()
    socket.emit('message', { data: JSON.stringify({ op: 0, s: 7, t: 'READY', d: {} }) })
    await flush()

    scheduler.fire()

    expect(socket.sent).toContainEqual(JSON.stringify({ op: 1, d: 7 }))
  })

  it('delivers a dispatch event to the handler', async () => {
    FakeWebSocket.instances = []
    const scheduler = fakeScheduler()
    const received: unknown[] = []
    const client = createDiscordGatewayClient({
      token: 'tok',
      intents: 1,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      scheduleHeartbeat: scheduler.schedule,
    })

    const connectPromise = client.connect(async (event) => {
      received.push(event)
    })
    const socket = await waitForSocket(0)
    socket.emit('open')
    await connectPromise
    socket.emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) })
    await flush()

    socket.emit('message', {
      data: JSON.stringify({ op: 0, s: 1, t: 'MESSAGE_CREATE', d: { content: 'hi' } }),
    })
    await flush()

    expect(received).toEqual([{ type: 'MESSAGE_CREATE', data: { content: 'hi' } }])
  })

  it('reconnects when the socket closes, while still connected', async () => {
    FakeWebSocket.instances = []
    const scheduler = fakeScheduler()
    const client = createDiscordGatewayClient({
      token: 'tok',
      intents: 1,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      scheduleHeartbeat: scheduler.schedule,
    })

    const connectPromise = client.connect(async () => {})
    const first = await waitForSocket(0)
    first.emit('open')
    await connectPromise
    first.emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) })
    await flush()

    first.close()
    const second = await waitForSocket(1)
    second.emit('open')
    await flush()

    expect(scheduler.cancelled).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('does not reconnect after disconnect() was called, and cancels the heartbeat', async () => {
    FakeWebSocket.instances = []
    const scheduler = fakeScheduler()
    const client = createDiscordGatewayClient({
      token: 'tok',
      intents: 1,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      scheduleHeartbeat: scheduler.schedule,
    })

    const connectPromise = client.connect(async () => {})
    const first = await waitForSocket(0)
    first.emit('open')
    await connectPromise
    first.emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) })
    await flush()

    client.disconnect()
    await flush()

    expect(scheduler.cancelled).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
