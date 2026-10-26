import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ExecutableTool } from '@cogenta/agents'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpHttpHandler, type McpHttpRequestRecord } from '../src/http-transport.js'
import { createMcpServer } from '../src/server.js'

/**
 * The Streamable HTTP transport against a real `node:http` server — the
 * protocol rules a remote client relies on, independent of Cogenta's tools.
 */

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

function waitingTool(release: Promise<void>): ExecutableTool {
  return {
    spec: { name: 'wait', description: 'Waits.', inputSchema: {} },
    execute: async (_input, context) => {
      await Promise.race([
        release,
        new Promise((_resolve, reject) =>
          context.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
      ])
      return { done: true }
    },
  }
}

async function listen(
  tools: readonly ExecutableTool[],
  records: McpHttpRequestRecord[] = [],
): Promise<string> {
  const mcp = createMcpServer({ name: 'test', version: '0.0.0', tools })
  const handler = createMcpHttpHandler({
    keepAliveMs: 20,
    allowOrigin: (origin) => origin === 'https://site.example',
    onRequest: (record) => records.push(record),
    authorize: async (request) =>
      request.headers.authorization === 'Bearer good'
        ? { server: mcp, scope: 'key-1' }
        : { refused: true, status: 401, message: 'no' },
  })
  const server = createServer((request, response) => void handler(request, response))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function post(
  base: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer good', ...headers },
    body: JSON.stringify(body),
  })
}

describe('createMcpHttpHandler', () => {
  it('answers a request with one JSON body and a notification with 202 and nothing', async () => {
    const base = await listen([])
    const ping = await post(base, { jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(ping.status).toBe(200)
    expect(await ping.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} })

    const note = await post(base, { jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(note.status).toBe(202)
    expect(await note.text()).toBe('')
  })

  it('refuses a batch: one message per request', async () => {
    const base = await listen([])
    const batch = await post(base, [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ])
    expect(batch.status).toBe(400)
  })

  it('refuses an unauthorized caller before reading the body, and a foreign origin', async () => {
    const base = await listen([])
    expect(
      (await post(base, { jsonrpc: '2.0', id: 1, method: 'ping' }, { authorization: 'x' })).status,
    ).toBe(401)
    expect(
      (
        await post(
          base,
          { jsonrpc: '2.0', id: 1, method: 'ping' },
          { origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await post(
          base,
          { jsonrpc: '2.0', id: 1, method: 'ping' },
          { origin: 'https://site.example' },
        )
      ).status,
    ).toBe(200)
  })

  it('streams a tools/call as server-sent events, keeping the connection alive while it waits', async () => {
    let release: () => void = () => undefined
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const base = await listen([waitingTool(released)])
    const response = await post(
      base,
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'wait' } },
      { accept: 'application/json, text/event-stream' },
    )
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/u)
    setTimeout(release, 80)
    const text = await response.text()
    expect(text).toContain(': keep-alive')
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { id?: number; result?: { isError: boolean } })
    expect(data.at(-1)).toMatchObject({ id: 7, result: { isError: false } })
  })

  it('cancels a call from a later request of the same caller, even while another request finishes', async () => {
    const records: McpHttpRequestRecord[] = []
    const base = await listen([waitingTool(new Promise(() => undefined))], records)
    const call = post(base, {
      jsonrpc: '2.0',
      id: 'c1',
      method: 'tools/call',
      params: { name: 'wait' },
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    await post(base, { jsonrpc: '2.0', id: 2, method: 'ping' })
    const cancel = await post(base, {
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 'c1' },
    })
    expect(cancel.status).toBe(202)
    const reply = await call
    // A cancelled call gets no JSON-RPC reply: the request ends with 202 and no body.
    expect(reply.status).toBe(202)
    expect(records.find((record) => record.tool === 'wait')).toMatchObject({ scope: 'key-1' })
  })

  it('never logs a free-text method or tool name as is', async () => {
    const records: McpHttpRequestRecord[] = []
    const base = await listen([], records)
    await post(base, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'x'.repeat(500) },
    })
    expect(records.at(-1)).toMatchObject({ method: 'tools/call', tool: null })
  })
})
