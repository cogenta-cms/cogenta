import { PassThrough } from 'node:stream'
import type { ChildProcessLike } from '../../src/client/types.js'

/** A fake `stdio` MCP server for tests — same shape `stdio-client.test.ts` uses, shared so the registry tests exercise the exact same fake rather than a second re-implementation. */
export function fakeMcpServer(handlers: Readonly<Record<string, (params: unknown) => unknown>>): {
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
      const request = JSON.parse(trimmed) as {
        readonly id: number
        readonly method: string
        readonly params?: unknown
      }
      const handler = handlers[request.method]
      if (handler === undefined) continue
      toClient.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: handler(request.params) })}\n`,
      )
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
