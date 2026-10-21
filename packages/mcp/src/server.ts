import type { ExecutableTool, ToolExecutionContext } from '@cogenta/agents'
import { isCogentaError } from '@cogenta/core'
import {
  JsonRpcErrorCode,
  type JsonRpcNotification,
  type JsonRpcResponse,
  jsonRpcError,
  jsonRpcSuccess,
} from './jsonrpc.js'

/**
 * Newest first. `initialize` echoes the version a client asks for when it is
 * one of these, and answers with the first one otherwise — what the
 * specification asks of a server ("the latest version it supports").
 *
 * Every version here shares the subset this server implements: `initialize`,
 * `ping`, `tools/list`, `tools/call`, `notifications/cancelled` and
 * `notifications/progress`. Nothing a later revision added (tasks, icons,
 * elicitation, sampling) is offered, and none of it is required.
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const

/** The hints MCP lets a server attach to a tool (`ToolAnnotations`). Advisory only: they never replace a permission check. */
export interface McpToolAnnotations {
  readonly title?: string
  readonly readOnlyHint?: boolean
  readonly destructiveHint?: boolean
  readonly idempotentHint?: boolean
  readonly openWorldHint?: boolean
}

/**
 * What a tool receives on a call made through this server: the run signal
 * every `ExecutableTool` already takes, plus a way to tell a waiting client
 * that the call is still alive. `progress` is present only when the client
 * asked for progress (`_meta.progressToken`) and the transport can push a
 * notification before the reply.
 */
export interface McpCallContext extends ToolExecutionContext {
  readonly progress?: (message: string) => void
}

/**
 * A tool this server exposes. Any `ExecutableTool` already is one — the
 * optional `title`/`annotations` are presentation, decided by whoever builds
 * the list (the registry stays the source of what a tool *does*).
 */
export interface McpTool {
  readonly spec: ExecutableTool['spec']
  readonly title?: string
  readonly annotations?: McpToolAnnotations
  execute(input: Readonly<Record<string, unknown>>, context: McpCallContext): Promise<unknown>
}

/**
 * The tools for one request. A function is called on every `tools/list` and
 * every `tools/call`, so a list that depends on who is calling — a revoked
 * key, an account whose roles just changed — is never answered from a
 * snapshot taken when the connection opened.
 */
export type McpToolSource = readonly McpTool[] | (() => Promise<readonly McpTool[]>)

export interface McpServerOptions {
  readonly name: string
  readonly version: string
  /** Shown to the model by most clients: how to use this server, in a few sentences. */
  readonly instructions?: string
  /**
   * The already-built manifest for this MCP server's caller — permissions,
   * autonomy and audit are decided by whoever built this list (task 4's
   * `buildManifest`, plus whichever decorators from tasks 6/9/10 that caller
   * wraps it in), never by this module. "Le registre d'outils est le
   * serveur MCP : aucun travail supplémentaire, seulement une exposition."
   */
  readonly tools: McpToolSource
  /** Told about every failure that is not a `CogentaError` — what the caller is not shown. */
  readonly onInternalError?: (error: unknown) => void
}

/**
 * In-flight `tools/call` requests of one client, by JSON-RPC id — what a
 * `notifications/cancelled` from that same client aborts. A transport owns
 * one per connection (stdio) or per authenticated caller (HTTP), so one
 * client can never cancel another's call by guessing an id.
 */
export interface McpCancellationRegistry {
  register(id: string | number, controller: AbortController): () => void
  cancel(id: string | number, reason?: string): boolean
  /** How many calls are still running — lets a transport forget an idle registry. */
  size(): number
}

export function createCancellationRegistry(): McpCancellationRegistry {
  const controllers = new Map<string, AbortController>()
  const keyOf = (id: string | number): string => `${typeof id}:${String(id)}`
  return {
    register(id, controller) {
      const key = keyOf(id)
      controllers.set(key, controller)
      return () => {
        if (controllers.get(key) === controller) controllers.delete(key)
      }
    },
    cancel(id, reason) {
      const controller = controllers.get(keyOf(id))
      if (controller === undefined) return false
      controller.abort(reason ?? 'cancelled by the client')
      return true
    },
    size: () => controllers.size,
  }
}

export interface McpHandleOptions {
  /** Pushes a server-to-client notification before the reply (stdio). Absent: progress is simply not reported. */
  readonly notify?: (notification: JsonRpcNotification) => void
  /** The transport's own end of life — the connection closed, nobody is left to answer. */
  readonly signal?: AbortSignal
  /** Where this caller's in-flight calls are kept; a private one per server when absent. */
  readonly cancellations?: McpCancellationRegistry
}

export interface McpServer {
  /**
   * Handles exactly one JSON-RPC message; the caller owns transport (stdio,
   * HTTP, or a direct call in a test). `null` means "send nothing": the
   * message was a notification, a response, or a request the client itself
   * cancelled — JSON-RPC forbids answering the first two, and MCP asks a
   * server not to answer the third.
   */
  handle(message: unknown, options?: McpHandleOptions): Promise<JsonRpcResponse | null>
}

function toolResultContent(text: string, isError: boolean): Readonly<Record<string, unknown>> {
  return { content: [{ type: 'text', text }], isError }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

/**
 * What the model reads when a call fails. A `CogentaError` carries a message
 * and a hint written for a person; both go through, and an input validation
 * failure names the fields it is about — "did not match its declared schema"
 * alone gives a model nothing to correct.
 */
export function describeToolError(error: unknown): string {
  // Anything that is not a `CogentaError` was not written for the caller: a
  // database driver's message can name an internal host or account. The
  // caller gets a plain sentence; the details go to the server's log
  // (`McpServerOptions.onInternalError`).
  if (!isCogentaError(error)) {
    return 'The server hit an internal error while handling this call. The details are in the site’s server log.'
  }
  const lines = [error.message]
  const details = error.details
  const issues = isRecord(details) ? details['issues'] : undefined
  if (Array.isArray(issues)) {
    for (const issue of issues.slice(0, 10)) {
      if (!isRecord(issue)) continue
      const path = Array.isArray(issue['path']) ? issue['path'].map(String).join('.') : ''
      const message = typeof issue['message'] === 'string' ? issue['message'] : 'invalid'
      lines.push(`- ${path === '' ? '(input)' : path}: ${message}`)
    }
  }
  if (error.hint !== undefined) lines.push(error.hint)
  return lines.join('\n')
}

function negotiatedVersion(params: Readonly<Record<string, unknown>> | undefined): string {
  const requested = params?.['protocolVersion']
  return typeof requested === 'string' &&
    (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_SUPPORTED_PROTOCOL_VERSIONS[0]
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const ownCancellations = createCancellationRegistry()

  async function currentTools(): Promise<readonly McpTool[]> {
    return typeof options.tools === 'function' ? options.tools() : options.tools
  }

  function describe(error: unknown): string {
    if (!isCogentaError(error)) options.onInternalError?.(error)
    return describeToolError(error)
  }

  /** A tool source that refuses (a revoked key, a disabled account) answers every request with that refusal. */
  function unauthorized(id: string | number | null, error: unknown): JsonRpcResponse {
    return jsonRpcError(id, JsonRpcErrorCode.UNAUTHORIZED, describe(error))
  }

  async function callTool(
    id: string | number,
    params: Readonly<Record<string, unknown>> | undefined,
    handleOptions: McpHandleOptions,
  ): Promise<JsonRpcResponse | null> {
    const name = params?.['name']
    if (typeof name !== 'string') {
      return jsonRpcError(id, JsonRpcErrorCode.INVALID_PARAMS, 'params.name must be a string.')
    }
    const rawArguments = params?.['arguments']
    if (rawArguments !== undefined && rawArguments !== null && !isRecord(rawArguments)) {
      return jsonRpcError(
        id,
        JsonRpcErrorCode.INVALID_PARAMS,
        'params.arguments must be an object of named arguments.',
      )
    }

    let tools: readonly McpTool[]
    try {
      tools = await currentTools()
    } catch (error) {
      return unauthorized(id, error)
    }
    const tool = tools.find((candidate) => candidate.spec.name === name)
    if (tool === undefined) {
      // -32602, what the specification names for an unknown tool: the method
      // exists, the argument naming the tool is what is wrong. Said plainly,
      // so a model does not keep retrying a tool its caller may not use.
      return jsonRpcError(
        id,
        JsonRpcErrorCode.INVALID_PARAMS,
        `Unknown tool "${name}": it does not exist on this server, or the role of this connection may not use it. Call tools/list for the tools available to you.`,
      )
    }

    const controller = new AbortController()
    const cancellations = handleOptions.cancellations ?? ownCancellations
    const unregister = cancellations.register(id, controller)
    const transportSignal = handleOptions.signal
    const onTransportAbort = () => controller.abort('the connection closed')
    if (transportSignal?.aborted === true) controller.abort('the connection closed')
    transportSignal?.addEventListener('abort', onTransportAbort, { once: true })

    const meta = params?.['_meta']
    const progressToken = isRecord(meta) ? meta['progressToken'] : undefined
    let progressCount = 0
    const notify = handleOptions.notify
    const progress =
      notify !== undefined && isId(progressToken)
        ? (message: string) => {
            if (controller.signal.aborted) return
            progressCount += 1
            notify({
              jsonrpc: '2.0',
              method: 'notifications/progress',
              params: { progressToken, progress: progressCount, message },
            })
          }
        : undefined

    try {
      const output = await tool.execute(isRecord(rawArguments) ? rawArguments : {}, {
        signal: controller.signal,
        ...(progress === undefined ? {} : { progress }),
      })
      if (controller.signal.aborted) return null
      const text = typeof output === 'string' ? output : JSON.stringify(output ?? null)
      return jsonRpcSuccess(id, toolResultContent(text, false))
    } catch (error) {
      // A cancelled request gets no reply (the client already gave up on
      // it); any other failure is MCP protocol data — `isError: true` in a
      // successful result, never a JSON-RPC error — because the call itself
      // succeeded, the tool it invoked did not.
      if (controller.signal.aborted) return null
      return jsonRpcSuccess(id, toolResultContent(describe(error), true))
    } finally {
      unregister()
      transportSignal?.removeEventListener('abort', onTransportAbort)
    }
  }

  return {
    async handle(message: unknown, handleOptions: McpHandleOptions = {}) {
      if (!isRecord(message) || message['jsonrpc'] !== '2.0') {
        const id = isRecord(message) && isId(message['id']) ? message['id'] : null
        return jsonRpcError(id, JsonRpcErrorCode.INVALID_REQUEST, 'Not a JSON-RPC 2.0 message.')
      }
      const method = message['method']
      const hasId = 'id' in message && message['id'] !== undefined

      // A response from the client (to a request this server never sends)
      // or anything else without a method: nothing to answer.
      if (typeof method !== 'string') {
        if (hasId && !('result' in message) && !('error' in message)) {
          const id = isId(message['id']) ? message['id'] : null
          return jsonRpcError(id, JsonRpcErrorCode.INVALID_REQUEST, 'A request needs a method.')
        }
        return null
      }
      const params = isRecord(message['params']) ? message['params'] : undefined

      // Notifications never get a reply, known or not (JSON-RPC 2.0 §4.1).
      if (!hasId) {
        if (method === 'notifications/cancelled') {
          const requestId = params?.['requestId']
          const reason = params?.['reason']
          if (isId(requestId)) {
            ;(handleOptions.cancellations ?? ownCancellations).cancel(
              requestId,
              typeof reason === 'string' ? reason : undefined,
            )
          }
        }
        return null
      }

      const id = message['id']
      if (!isId(id)) {
        return jsonRpcError(
          null,
          JsonRpcErrorCode.INVALID_REQUEST,
          'The id must be a string or a number.',
        )
      }

      if (method === 'initialize') {
        return jsonRpcSuccess(id, {
          protocolVersion: negotiatedVersion(params),
          serverInfo: { name: options.name, version: options.version },
          capabilities: { tools: { listChanged: false } },
          ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
        })
      }

      if (method === 'ping') return jsonRpcSuccess(id, {})

      if (method === 'tools/list') {
        let tools: readonly McpTool[]
        try {
          tools = await currentTools()
        } catch (error) {
          return unauthorized(id, error)
        }
        return jsonRpcSuccess(id, {
          tools: tools.map((tool) => ({
            name: tool.spec.name,
            ...(tool.title === undefined ? {} : { title: tool.title }),
            description: tool.spec.description,
            inputSchema: tool.spec.inputSchema,
            ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
          })),
        })
      }

      if (method === 'tools/call') return callTool(id, params, handleOptions)

      return jsonRpcError(id, JsonRpcErrorCode.METHOD_NOT_FOUND, `Unknown method "${method}".`)
    },
  }
}

/**
 * One transport payload: a single message or, as the 2025-03-26 revision
 * still allows, a batch. A batch answers with the replies its requests
 * produced, in order; one that produced none answers nothing.
 */
export async function handleJsonRpcPayload(
  server: McpServer,
  payload: unknown,
  options: McpHandleOptions = {},
): Promise<JsonRpcResponse | readonly JsonRpcResponse[] | null> {
  if (!Array.isArray(payload)) return server.handle(payload, options)
  if (payload.length === 0) {
    return jsonRpcError(null, JsonRpcErrorCode.INVALID_REQUEST, 'An empty batch is not a request.')
  }
  const replies = await Promise.all(payload.map((message) => server.handle(message, options)))
  const answered = replies.filter((reply): reply is JsonRpcResponse => reply !== null)
  return answered.length === 0 ? null : answered
}
