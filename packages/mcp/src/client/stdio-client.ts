import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { CogentaError } from '@cogenta/core'
import type { JsonRpcResponse } from '../jsonrpc.js'
import type {
  ChildProcessLike,
  McpClient,
  McpServerInfo,
  McpToolCallResult,
  McpToolSpec,
} from './types.js'

export interface McpStdioClientOptions {
  readonly command: string
  readonly args?: readonly string[]
  /** Injectable for tests — defaults to `node:child_process.spawn`, piping stdio. */
  readonly spawnFn?: (command: string, args: readonly string[]) => ChildProcessLike
}

function defaultSpawn(command: string, args: readonly string[]): ChildProcessLike {
  const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'inherit'] })
  return { stdin: child.stdin, stdout: child.stdout, kill: () => child.kill() }
}

/**
 * The same JSON-RPC-per-line protocol `serveMcpOverStdio` (task 17) speaks,
 * from the other end: spawns a third-party MCP server as a child process and
 * talks to it over its stdio. "Le client MCP permet aux agents de consommer
 * des serveurs tiers" — this is that consumption; `wrapMcpTool` is what
 * turns what it discovers into something the runtime can actually grant to
 * an agent, with permissions declared exactly like an internal tool.
 */
export function createMcpStdioClient(options: McpStdioClientOptions): McpClient {
  const spawnFn = options.spawnFn ?? defaultSpawn
  const child = spawnFn(options.command, options.args ?? [])
  const rl = createInterface({ input: child.stdout })
  const pending = new Map<number, (response: JsonRpcResponse) => void>()
  let nextId = 1

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (trimmed === '') return
    let response: JsonRpcResponse
    try {
      response = JSON.parse(trimmed) as JsonRpcResponse
    } catch {
      return
    }
    if (typeof response.id !== 'number') return
    const resolve = pending.get(response.id)
    if (resolve === undefined) return
    pending.delete(response.id)
    resolve(response)
  })

  function send(method: string, params?: Readonly<Record<string, unknown>>): Promise<unknown> {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, (response) => {
        if ('error' in response) {
          reject(
            new CogentaError({
              code: 'MCP_CLIENT_REMOTE_ERROR',
              message: response.error.message,
              hint: 'The remote MCP server reported a protocol-level error, not a tool failure.',
              details: { code: response.error.code, data: response.error.data },
            }),
          )
          return
        }
        resolve(response.result)
      })
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`,
      )
    })
  }

  return {
    async initialize(): Promise<McpServerInfo> {
      const result = (await send('initialize')) as { serverInfo: McpServerInfo }
      return result.serverInfo
    },
    async listTools(): Promise<readonly McpToolSpec[]> {
      const result = (await send('tools/list')) as { tools: readonly McpToolSpec[] }
      return result.tools
    },
    async callTool(name, args): Promise<McpToolCallResult> {
      return (await send('tools/call', { name, arguments: args })) as McpToolCallResult
    },
    close() {
      rl.close()
      child.kill()
    },
  }
}
