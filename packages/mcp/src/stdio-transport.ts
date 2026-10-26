import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { JsonRpcErrorCode, jsonRpcError } from './jsonrpc.js'
import { createCancellationRegistry, handleJsonRpcPayload, type McpServer } from './server.js'

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
 * One JSON-RPC message per line in, one per line out — MCP's simplest
 * transport: a locally-spawned server talking to its parent process over its
 * own stdin/stdout, no network port involved.
 *
 * The connection is the unit of everything per client here: one cancellation
 * registry (a `notifications/cancelled` only reaches this client's own
 * calls), one signal that aborts every call still running when the input
 * closes, and progress notifications written on the same stream as replies.
 * Notifications from the client are never answered — JSON-RPC forbids it.
 */
export function serveMcpOverStdio(options: StdioTransportOptions): StdioTransport {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const rl = createInterface({ input })
  const connection = new AbortController()
  const cancellations = createCancellationRegistry()

  // Replies still go out after the input closed: a client that writes its
  // requests and then closes its end (`printf … | cogenta mcp`) is owed the
  // answers to what it already sent. Calls still running are aborted, and an
  // aborted call produces no reply of its own.
  const write = (message: unknown): void => {
    if (output.writableEnded || output.destroyed) return
    output.write(`${JSON.stringify(message)}\n`)
  }
  const end = () => connection.abort('the connection closed')
  rl.on('close', end)

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (trimmed === '') return

    void (async () => {
      let payload: unknown
      try {
        payload = JSON.parse(trimmed) as unknown
      } catch {
        write(jsonRpcError(null, JsonRpcErrorCode.PARSE_ERROR, 'Invalid JSON.'))
        return
      }
      const reply = await handleJsonRpcPayload(options.server, payload, {
        notify: write,
        signal: connection.signal,
        cancellations,
      })
      if (reply !== null) write(reply)
    })()
  })

  return {
    close: () => {
      rl.close()
      end()
    },
  }
}
