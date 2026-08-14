import { describe, expect, it, vi } from 'vitest'
import { createSlackSocketClient } from '../../../src/providers/slack/socket.js'

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
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners[type] ?? []) listener(event)
  }
}

function fakeFetch(url: string): Response {
  return new Response(
    JSON.stringify({ ok: true, url: `wss://fake.example/${url.split('/').pop()}` }),
    {
      status: 200,
    },
  )
}

/** `connect()` awaits the real (mocked) `apps.connections.open` fetch before constructing a socket — wait for that microtask chain to actually create the instance rather than checking synchronously. */
async function waitForSocket(index: number): Promise<FakeWebSocket> {
  for (let i = 0; i < 50; i++) {
    const socket = FakeWebSocket.instances[index]
    if (socket !== undefined) return socket
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`No FakeWebSocket instance at index ${index} after waiting.`)
}

describe('createSlackSocketClient', () => {
  it('opens a connection via apps.connections.open and connects a real WebSocket to the returned url', async () => {
    FakeWebSocket.instances = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => fakeFetch(String(url)))
    const client = createSlackSocketClient({
      appToken: 'xapp-test',
      fetchImpl,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })

    const connectPromise = client.connect(async () => {})
    const socket = await waitForSocket(0)
    socket.emit('open')
    await connectPromise

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://slack.com/api/apps.connections.open',
      expect.anything(),
    )
    expect(socket.url).toContain('wss://fake.example')
  })

  it('delivers an envelope to the handler and acks it with the real envelope_id', async () => {
    FakeWebSocket.instances = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => fakeFetch(String(url)))
    const received: unknown[] = []
    const client = createSlackSocketClient({
      appToken: 'xapp-test',
      fetchImpl,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })

    const connectPromise = client.connect(async (envelope) => {
      received.push(envelope)
    })
    const socket = await waitForSocket(0)
    socket.emit('open')
    await connectPromise

    socket.emit('message', {
      data: JSON.stringify({ type: 'events_api', envelope_id: 'E1', payload: {} }),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(received).toEqual([{ type: 'events_api', envelope_id: 'E1', payload: {} }])
    expect(socket.sent).toEqual([JSON.stringify({ envelope_id: 'E1' })])
  })

  it('does not ack a "hello" or "disconnect" envelope', async () => {
    FakeWebSocket.instances = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => fakeFetch(String(url)))
    const received: unknown[] = []
    const client = createSlackSocketClient({
      appToken: 'xapp-test',
      fetchImpl,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })

    const connectPromise = client.connect(async (envelope) => {
      received.push(envelope)
    })
    const socket = await waitForSocket(0)
    socket.emit('open')
    await connectPromise

    socket.emit('message', { data: JSON.stringify({ type: 'hello' }) })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(socket.sent).toEqual([])
  })

  it('reconnects once when told to disconnect, while still connected', async () => {
    FakeWebSocket.instances = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => fakeFetch(String(url)))
    const client = createSlackSocketClient({
      appToken: 'xapp-test',
      fetchImpl,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })

    const connectPromise = client.connect(async () => {})
    const first = await waitForSocket(0)
    first.emit('open')
    await connectPromise

    first.emit('message', {
      data: JSON.stringify({ type: 'disconnect', reason: 'refresh_requested' }),
    })
    const second = await waitForSocket(1)
    second.emit('open')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(first.closed).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('does not reconnect after disconnect() was called', async () => {
    FakeWebSocket.instances = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => fakeFetch(String(url)))
    const client = createSlackSocketClient({
      appToken: 'xapp-test',
      fetchImpl,
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })

    const connectPromise = client.connect(async () => {})
    const first = await waitForSocket(0)
    first.emit('open')
    await connectPromise
    client.disconnect()

    first.emit('message', { data: JSON.stringify({ type: 'disconnect', reason: 'warning' }) })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
