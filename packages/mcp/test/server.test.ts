import type { ExecutableTool } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { createMcpServer } from '../src/server.js'

function echoTool(): ExecutableTool {
  return {
    spec: {
      name: 'echo',
      description: 'Echoes its input.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    },
    execute: async (input) => ({ echoed: input.text }),
  }
}

function failingTool(): ExecutableTool {
  return {
    spec: { name: 'boom', description: 'Always fails.', inputSchema: {} },
    execute: async () => {
      throw new Error('kaboom')
    },
  }
}

describe('createMcpServer', () => {
  it('answers initialize with server info and tools capability', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })

    const response = await server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'cogenta', version: '1.0.0' },
        capabilities: { tools: { listChanged: false } },
      },
    })
  })

  it('lists every tool the server was built with, by name/description/inputSchema', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [echoTool()] })

    const response = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: { tools: [{ name: 'echo', description: 'Echoes its input.' }] },
    })
  })

  it('calls a tool by name with the given arguments, wrapping its output as text content', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [echoTool()] })

    const response = await server.handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'hi' } },
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ echoed: 'hi' }) }],
        isError: false,
      },
    })
  })

  it('reports a tool failure as isError: true inside a successful result, not a JSON-RPC error', async () => {
    const internal: unknown[] = []
    const server = createMcpServer({
      name: 'cogenta',
      version: '1.0.0',
      tools: [failingTool()],
      onInternalError: (error) => internal.push(error),
    })

    const response = await server.handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'boom' },
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 4,
      result: {
        // Not a CogentaError: its message (possibly naming an internal host)
        // stays in the server's log, the caller reads a plain sentence.
        content: [{ type: 'text', text: expect.stringMatching(/internal error/u) }],
        isError: true,
      },
    })
    expect('error' in (response as { error?: unknown })).toBe(false)
    expect(internal).toHaveLength(1)
  })

  it('returns a JSON-RPC error for a call to an unknown tool', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })

    const response = await server.handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'ghost' },
    })

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 5,
      error: { message: expect.stringContaining('"ghost"') },
    })
  })

  it('returns a JSON-RPC error when params.name is missing or not a string', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })

    const response = await server.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call' })

    expect(response).toMatchObject({ error: { code: -32602 } })
  })

  it('returns a JSON-RPC error for an unknown method', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })

    const response = await server.handle({ jsonrpc: '2.0', id: 7, method: 'resources/list' })

    expect(response).toMatchObject({ error: { code: -32601 } })
  })

  it('never exposes a tool the server was not built with', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [echoTool()] })

    const response = await server.handle({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'boom' },
    })

    // -32602 (invalid params), what the specification names for an unknown tool.
    expect(response).toMatchObject({ error: { code: -32602 } })
  })

  it('answers ping, and never answers a notification', async () => {
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })

    expect(await server.handle({ jsonrpc: '2.0', id: 9, method: 'ping' })).toEqual({
      jsonrpc: '2.0',
      id: 9,
      result: {},
    })
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/unknown' })).toBeNull()
  })

  it('aborts a running call on notifications/cancelled and sends no reply for it', async () => {
    let seen: AbortSignal | undefined
    const slow: ExecutableTool = {
      spec: { name: 'slow', description: 'Waits to be cancelled.', inputSchema: {} },
      execute: (_input, context) =>
        new Promise((_resolve, reject) => {
          seen = context.signal
          context.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    }
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [slow] })

    const pending = server.handle({
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: { name: 'slow' },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(
      await server.handle({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 'call-1', reason: 'timeout' },
      }),
    ).toBeNull()

    expect(await pending).toBeNull()
    expect(seen?.aborted).toBe(true)
  })
})
