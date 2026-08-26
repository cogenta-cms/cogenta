import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { SpawnOptionsForClient } from '../../src/client/stdio-client.js'
import { createMcpStdioClient } from '../../src/client/stdio-client.js'
import type { ChildProcessLike } from '../../src/client/types.js'

const CWD = tmpdir()

function serverWith(handlers: Readonly<Record<string, () => unknown>>): {
  child: ChildProcessLike
  killed: { value: boolean }
  receivedEnv: { value: Readonly<Record<string, string>> | undefined }
} {
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const killed = { value: false }
  const receivedEnv: { value: Readonly<Record<string, string>> | undefined } = { value: undefined }

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
    receivedEnv,
  }
}

describe('createMcpStdioClient', () => {
  it('initializes and returns the remote server info', async () => {
    const { child } = serverWith({
      initialize: () => ({ serverInfo: { name: 'remote', version: '2.0.0' } }),
    })
    const client = createMcpStdioClient({ command: 'ignored', cwd: CWD, spawnFn: () => child })

    const info = await client.initialize()

    expect(info).toEqual({ name: 'remote', version: '2.0.0' })
    client.close()
  })

  it('lists the remote server’s tools', async () => {
    const { child } = serverWith({
      'tools/list': () => ({ tools: [{ name: 'echo', description: 'Echo.', inputSchema: {} }] }),
    })
    const client = createMcpStdioClient({ command: 'ignored', cwd: CWD, spawnFn: () => child })

    const tools = await client.listTools()

    expect(tools).toEqual([{ name: 'echo', description: 'Echo.', inputSchema: {} }])
    client.close()
  })

  it('calls a remote tool with the given arguments', async () => {
    const { child } = serverWith({
      'tools/call': () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    })
    const client = createMcpStdioClient({ command: 'ignored', cwd: CWD, spawnFn: () => child })

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
    const client = createMcpStdioClient({ command: 'ignored', cwd: CWD, spawnFn: () => child })

    await expect(client.initialize()).rejects.toThrowError(/Unknown method/)
    client.close()
  })

  it('close() kills the underlying process', () => {
    const { child, killed } = serverWith({})
    const client = createMcpStdioClient({ command: 'ignored', cwd: CWD, spawnFn: () => child })

    client.close()

    expect(killed.value).toBe(true)
  })

  describe('fiche 58 task 1bis — sandboxing floor', () => {
    it('spawns the process with no environment variables from the host by default', () => {
      const previous = process.env.COGENTA_TEST_SECRET
      process.env.COGENTA_TEST_SECRET = 'super-secret-value'
      try {
        const { child } = serverWith({})
        const spawnFn = vi.fn(
          (_command: string, _args: readonly string[], _options: SpawnOptionsForClient) => child,
        )
        const client = createMcpStdioClient({ command: 'ignored', cwd: CWD, spawnFn })

        expect(spawnFn).toHaveBeenCalledTimes(1)
        const spawnOptions = spawnFn.mock.calls[0]?.[2]
        expect(spawnOptions?.env).toEqual({})
        expect(spawnOptions?.env).not.toBe(process.env)
        expect(JSON.stringify(spawnOptions?.env)).not.toContain('super-secret-value')
        client.close()
      } finally {
        if (previous === undefined) delete process.env.COGENTA_TEST_SECRET
        else process.env.COGENTA_TEST_SECRET = previous
      }
    })

    it('passes through only the explicitly configured environment, never merged with process.env', () => {
      const { child } = serverWith({})
      const spawnFn = vi.fn(
        (_command: string, _args: readonly string[], _options: SpawnOptionsForClient) => child,
      )
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: CWD,
        env: { ONLY_THIS: 'value' },
        spawnFn,
      })

      expect(spawnFn.mock.calls[0]?.[2]?.env).toEqual({ ONLY_THIS: 'value' })
      client.close()
    })

    it('spawns with the given dedicated cwd, not process.cwd()', () => {
      const { child } = serverWith({})
      const spawnFn = vi.fn(
        (_command: string, _args: readonly string[], _options: SpawnOptionsForClient) => child,
      )
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: '/sandbox/dedicated',
        spawnFn,
      })

      expect(spawnFn.mock.calls[0]?.[2]?.cwd).toBe('/sandbox/dedicated')
      client.close()
    })

    it('a server that never responds is killed and its call rejected under the configured timeout', async () => {
      const toServer = new PassThrough()
      const toClient = new PassThrough()
      // Deliberately never writes back — the "hung server" case.
      toServer.resume()
      const killed = { value: false }
      const child: ChildProcessLike = {
        stdin: toServer,
        stdout: toClient,
        kill: () => {
          killed.value = true
        },
      }
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: CWD,
        callTimeoutMs: 30,
        spawnFn: () => child,
      })

      await expect(client.initialize()).rejects.toMatchObject({ code: 'MCP_CLIENT_CALL_TIMEOUT' })
      expect(killed.value).toBe(true)
    })

    it('rejects an in-flight call when its own abort signal fires, without waiting for the timeout', async () => {
      const toServer = new PassThrough()
      const toClient = new PassThrough()
      toServer.resume()
      const child: ChildProcessLike = { stdin: toServer, stdout: toClient, kill: () => undefined }
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: CWD,
        callTimeoutMs: 10_000,
        spawnFn: () => child,
      })
      const controller = new AbortController()

      const pending = client.initialize({ signal: controller.signal })
      controller.abort()

      await expect(pending).rejects.toMatchObject({ code: 'MCP_CLIENT_CALL_ABORTED' })
      client.close()
    })

    it('captures stderr through the structured logger instead of inheriting it', async () => {
      const toServer = new PassThrough()
      const toClient = new PassThrough()
      const toStderr = new PassThrough()
      toServer.on('data', (chunk: Buffer) => {
        const request = JSON.parse(chunk.toString('utf8').trim()) as { readonly id: number }
        toClient.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { serverInfo: { name: 'r', version: '1' } } })}\n`,
        )
      })
      const child: ChildProcessLike = {
        stdin: toServer,
        stdout: toClient,
        stderr: toStderr,
        kill: () => undefined,
      }
      const warn = vi.fn()
      const logger = {
        level: 'silent' as const,
        debug: () => undefined,
        info: () => undefined,
        warn,
        error: () => undefined,
        child: () => logger,
        isLevelEnabled: () => false,
      }
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: CWD,
        logger,
        spawnFn: () => child,
      })
      toStderr.write('a secret-looking line from the remote process\n')
      await client.initialize()

      await vi.waitFor(() => expect(warn).toHaveBeenCalled())
      client.close()
    })

    it('kills the process and rejects every pending call once the injected watchdog probe reports over the configured ceiling', async () => {
      const { child, killed } = serverWith({
        initialize: () => ({ serverInfo: { name: 'remote', version: '1.0.0' } }),
        // Deliberately no `tools/list` handler — that call hangs, giving the
        // watchdog time to fire before any real response would arrive.
      })
      const childWithPid: ChildProcessLike = { ...child, pid: 4242 }
      const readPidUsage = vi.fn(async () => ({ rssBytes: 999 * 1024 * 1024, cpuPercent: 5 }))
      const error = vi.fn()
      const logger = {
        level: 'silent' as const,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error,
        child: () => logger,
        isLevelEnabled: () => false,
      }
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: CWD,
        logger,
        callTimeoutMs: 10_000,
        maxRssBytes: 512 * 1024 * 1024,
        watchdogPollMs: 10,
        readPidUsage,
        spawnFn: () => childWithPid,
      })
      await client.initialize()

      const hanging = client.listTools()

      await expect(hanging).rejects.toMatchObject({ code: 'MCP_CLIENT_RESOURCE_EXCEEDED' })
      expect(killed.value).toBe(true)
      expect(error).toHaveBeenCalledWith(
        'mcp client: resource ceiling exceeded, killing the process',
        expect.objectContaining({ reason: 'memory' }),
      )
    })

    it('never starts a watchdog when the child process has no known pid (a test double without one)', async () => {
      const { child } = serverWith({
        initialize: () => ({ serverInfo: { name: 'remote', version: '1.0.0' } }),
      })
      const readPidUsage = vi.fn(async () => ({ rssBytes: 999 * 1024 * 1024, cpuPercent: 999 }))
      const client = createMcpStdioClient({
        command: 'ignored',
        cwd: CWD,
        maxRssBytes: 1,
        watchdogPollMs: 10,
        readPidUsage,
        spawnFn: () => child, // no `pid` field
      })

      await client.initialize()
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(readPidUsage).not.toHaveBeenCalled()
      client.close()
    })
  })
})
