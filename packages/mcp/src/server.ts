import type { ExecutableTool } from '@cogenta/agents'
import {
  JsonRpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  jsonRpcError,
  jsonRpcSuccess,
} from './jsonrpc.js'

const PROTOCOL_VERSION = '2025-06-18'

export interface McpServerOptions {
  readonly name: string
  readonly version: string
  /**
   * The already-built manifest for this MCP server's caller — permissions,
   * autonomy and audit are decided by whoever built this list (task 4's
   * `buildManifest`, plus whichever decorators from tasks 6/9/10 that caller
   * wraps it in), never by this module. "Le registre d'outils est le
   * serveur MCP : aucun travail supplémentaire, seulement une exposition."
   */
  readonly tools: readonly ExecutableTool[]
}

export interface McpServer {
  /** Handles exactly one JSON-RPC request; the caller owns transport (stdio, HTTP, or a direct call in a test). */
  handle(request: JsonRpcRequest): Promise<JsonRpcResponse>
}

function toolResultContent(text: string, isError: boolean): Readonly<Record<string, unknown>> {
  return { content: [{ type: 'text', text }], isError }
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const toolIndex = new Map(options.tools.map((tool) => [tool.spec.name, tool]))

  return {
    async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
      if (request.method === 'initialize') {
        return jsonRpcSuccess(request.id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: options.name, version: options.version },
          capabilities: { tools: {} },
        })
      }

      if (request.method === 'tools/list') {
        return jsonRpcSuccess(request.id, {
          tools: options.tools.map((tool) => ({
            name: tool.spec.name,
            description: tool.spec.description,
            inputSchema: tool.spec.inputSchema,
          })),
        })
      }

      if (request.method === 'tools/call') {
        const name = request.params?.name
        if (typeof name !== 'string') {
          return jsonRpcError(
            request.id,
            JsonRpcErrorCode.INVALID_PARAMS,
            'params.name must be a string.',
          )
        }
        const tool = toolIndex.get(name)
        if (tool === undefined) {
          return jsonRpcError(
            request.id,
            JsonRpcErrorCode.METHOD_NOT_FOUND,
            `No tool named "${name}" on this server.`,
          )
        }

        const rawArguments = request.params?.arguments
        const toolArguments: Readonly<Record<string, unknown>> =
          rawArguments !== null && typeof rawArguments === 'object'
            ? (rawArguments as Readonly<Record<string, unknown>>)
            : {}

        // A tool failure is MCP protocol data (isError: true in a successful
        // result), never a JSON-RPC error — the call itself succeeded, the
        // tool it invoked did not.
        try {
          const controller = new AbortController()
          const output = await tool.execute(toolArguments, { signal: controller.signal })
          const text = typeof output === 'string' ? output : JSON.stringify(output ?? null)
          return jsonRpcSuccess(request.id, toolResultContent(text, false))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return jsonRpcSuccess(request.id, toolResultContent(message, true))
        }
      }

      return jsonRpcError(
        request.id,
        JsonRpcErrorCode.METHOD_NOT_FOUND,
        `Unknown method "${request.method}".`,
      )
    },
  }
}
