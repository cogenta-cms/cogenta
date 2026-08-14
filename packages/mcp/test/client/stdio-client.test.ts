import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createMcpStdioClient } from '../../src/client/stdio-client.js'
import type { ChildProcessLike } from '../../src/client/types.js'

function serverWith(handlers: Readonly<Record<string, () => unknown>>): {
  child: ChildProcessLike
  killed: { value: boolean }
} {
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const killed = { value: false }

  toServer.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      const request = JSON.parse(trimmed) as { readonly id: number; readonly method: string }
      const handler = handlers[request.method]
      if (handler === undefined) continue
      toClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: handler() })}\n`)
    }
  })

  return {
    child: {
      stdin: toServer,
      stdout: toClient,
      kill: () => {
        killed.value = true
      },
    },
    killed,
  }
}

describe('createMcpStdioClient', () => {
  it('initializes and returns the remote server info', async () => {
    const { child } = serverWith({
      initialize: () => ({ serverInfo: { name: 'remote', version: '2.0.0' } }),
    })
    const client = createMcpStdioClient({ command: 'ignored', spawnFn: () => child })

    const info = await client.initialize()

    expect(info).toEqual({ name: 'remote', version: '2.0.0' })
    client.close()
  })

  it('lists the remote server’s tools', async () => {
    const { child } = serverWith({
      'tools/list': () => ({ tools: [{ name: 'echo', description: 'Echo.', inputSchema: {} }] }),
    })
    const client = createMcpStdioClient({ command: 'ignored', spawnFn: () => child })

    const tools = await client.listTools()

    expect(tools).toEqual([{ name: 'echo', description: 'Echo.', inputSchema: {} }])
    client.close()
  })

  it('calls a remote tool with the given arguments', async () => {
    const { child } = serverWith({
      'tools/call': () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    })
    const client = createMcpStdioClient({ command: 'ignored', spawnFn: () => child })

    const result = await client.callTool('echo', { text: 'hi' })

    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }], isError: false })
    client.close()
  })

  it('rejects with MCP_CLIENT_REMOTE_ERROR when the server answers with a JSON-RPC error', async () => {
    const toServer = new PassThrough()
    const toClient = new PassThrough()
    toServer.on('data', (chunk: Buffer) => {
      const request = JSON.parse(chunk.toString('utf8').trim()) as { readonly id: number }
      toClient.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method.' } })}\n`,
      )
    })
    const child: ChildProcessLike = { stdin: toServer, stdout: toClient, kill: () => undefined }
    const client = createMcpStdioClient({ command: 'ignored', spawnFn: () => child })

    await expect(client.initialize()).rejects.toThrowError(/Unknown method/)
    client.close()
  })

  it('close() kills the underlying process', () => {
    const { child, killed } = serverWith({})
    const client = createMcpStdioClient({ command: 'ignored', spawnFn: () => child })

    client.close()

    expect(killed.value).toBe(true)
  })
})
