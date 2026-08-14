import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { JsonRpcErrorCode, type JsonRpcRequest, jsonRpcError } from './jsonrpc.js'
import type { McpServer } from './server.js'

export interface StdioTransportOptions {
  readonly server: McpServer
  /** Injectable for tests — defaults to the real process streams. */
  readonly input?: Readable
  readonly output?: Writable
}

export interface StdioTransport {
  close(): void
}

/**
 * One JSON-RPC request per line in, one response per line out — MCP's
 * simplest transport, and the only one this task needs: a locally-spawned
 * server talking to its parent process over its own stdin/stdout, no HTTP
 * server or network port involved.
 */
export function serveMcpOverStdio(options: StdioTransportOptions): StdioTransport {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const rl = createInterface({ input })

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (trimmed === '') return

    void (async () => {
      let request: JsonRpcRequest
      try {
        request = JSON.parse(trimmed) as JsonRpcRequest
      } catch {
        output.write(
          `${JSON.stringify(jsonRpcError(null, JsonRpcErrorCode.PARSE_ERROR, 'Invalid JSON.'))}\n`,
        )
        return
      }
      const response = await options.server.handle(request)
      output.write(`${JSON.stringify(response)}\n`)
    })()
  })

  return { close: () => rl.close() }
}
