import type { IncomingMessage, ServerResponse } from 'node:http'
import { JsonRpcErrorCode, jsonRpcError } from './jsonrpc.js'
import {
  createCancellationRegistry,
  handleJsonRpcPayload,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  type McpCancellationRegistry,
  type McpServer,
} from './server.js'

/**
 * MCP's Streamable HTTP transport, the stateless subset of it: every message
 * is a `POST` whose reply is one JSON body. No session id is issued and no
 * SSE stream is offered (`GET` answers 405, which the specification allows),
 * so a server restart, a second replica or a load balancer changes nothing
 * for a client — each request authenticates and stands on its own.
 *
 * Authentication is the caller's (`authorize`), and it runs on **every**
 * request, before the body is read: a key revoked a second ago is refused on
 * the next message, not at the next connection.
 */

export interface McpHttpAuthorization {
  readonly server: McpServer
  /**
   * Who is calling, as far as cancellation goes: a `notifications/cancelled`
   * only reaches calls made under the same scope (an API key id), so one
   * client can never cancel another's request by guessing its id.
   */
  readonly scope: string
}

export interface McpHttpRefusal {
  readonly refused: true
  readonly status: number
  readonly message: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface McpHttpRequestRecord {
  readonly scope: string | null
  readonly status: number
  readonly methods: readonly string[]
  readonly tool: string | null
  readonly durationMs: number
}

export interface McpHttpHandlerOptions {
  readonly authorize: (request: IncomingMessage) => Promise<McpHttpAuthorization | McpHttpRefusal>
  /** Bytes one message may carry. 4 MiB by default — a page with many blocks, never a file. */
  readonly maxBodyBytes?: number
  /**
   * DNS-rebinding defence the specification requires: a request carrying an
   * `Origin` header is refused (403) unless this accepts it. Clients that
   * are not browsers (Claude Code, Claude Desktop) send none.
   */
  readonly allowOrigin?: (origin: string, request: IncomingMessage) => boolean
  /** One line per request for the operator's log — never a key, never a body. */
  readonly onRequest?: (record: McpHttpRequestRecord) => void
}

export type McpHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  if (response.headersSent || response.writableEnded) return
  const payload = body === undefined ? undefined : JSON.stringify(body)
  response.writeHead(status, {
    'cache-control': 'no-store',
    ...(payload === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }),
    ...headers,
  })
  response.end(payload)
}

async function readLimited(request: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let total = 0
  let tooLarge = false
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    total += buffer.length
    if (total > limit) {
      // Keep draining so the 413 reaches the client on the same connection,
      // but stop buffering: memory stays bounded by `limit`.
      tooLarge = true
      continue
    }
    chunks.push(buffer)
  }
  return tooLarge ? null : Buffer.concat(chunks)
}

function methodsOf(payload: unknown): { methods: string[]; tool: string | null } {
  const messages = Array.isArray(payload) ? payload : [payload]
  const methods: string[] = []
  let tool: string | null = null
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) continue
    const method = (message as Record<string, unknown>)['method']
    if (typeof method !== 'string') continue
    methods.push(method)
    const params = (message as Record<string, unknown>)['params']
    if (method === 'tools/call' && typeof params === 'object' && params !== null) {
      const name = (params as Record<string, unknown>)['name']
      if (typeof name === 'string') tool = name
    }
  }
  return { methods, tool }
}

export function createMcpHttpHandler(options: McpHttpHandlerOptions): McpHttpHandler {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const registries = new Map<string, McpCancellationRegistry>()

  function registryFor(scope: string): McpCancellationRegistry {
    const existing = registries.get(scope)
    if (existing !== undefined) return existing
    const created = createCancellationRegistry()
    registries.set(scope, created)
    return created
  }

  return async (request, response) => {
    const started = Date.now()
    let scope: string | null = null
    let parsed: { methods: string[]; tool: string | null } = { methods: [], tool: null }
    const finish = (status: number, body?: unknown, headers?: Readonly<Record<string, string>>) => {
      send(response, status, body, headers)
      options.onRequest?.({
        scope,
        status,
        methods: parsed.methods,
        tool: parsed.tool,
        durationMs: Date.now() - started,
      })
    }

    if (request.method !== 'POST') {
      request.resume()
      finish(
        405,
        jsonRpcError(null, JsonRpcErrorCode.INVALID_REQUEST, 'Send MCP messages with POST.'),
        { allow: 'POST' },
      )
      return
    }

    const origin = request.headers.origin
    if (origin !== undefined && options.allowOrigin?.(origin, request) !== true) {
      request.resume()
      finish(
        403,
        jsonRpcError(null, JsonRpcErrorCode.INVALID_REQUEST, 'This origin may not call the MCP endpoint.'),
      )
      return
    }

    const version = request.headers['mcp-protocol-version']
    if (
      typeof version === 'string' &&
      !(MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)
    ) {
      request.resume()
      finish(
        400,
        jsonRpcError(
          null,
          JsonRpcErrorCode.INVALID_REQUEST,
          `Unsupported MCP-Protocol-Version "${version}". Supported: ${MCP_SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`,
        ),
      )
      return
    }

    const authorization = await options.authorize(request)
    if ('refused' in authorization) {
      request.resume()
      finish(
        authorization.status,
        jsonRpcError(null, JsonRpcErrorCode.UNAUTHORIZED, authorization.message),
        authorization.headers,
      )
      return
    }
    scope = authorization.scope

    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      request.resume()
      finish(
        415,
        jsonRpcError(null, JsonRpcErrorCode.INVALID_REQUEST, 'Send the message as application/json.'),
      )
      return
    }

    const body = await readLimited(request, maxBodyBytes)
    if (body === null) {
      finish(
        413,
        jsonRpcError(
          null,
          JsonRpcErrorCode.INVALID_REQUEST,
          `The message exceeds the ${maxBodyBytes}-byte limit of this endpoint.`,
        ),
      )
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(body.toString('utf8')) as unknown
    } catch {
      finish(400, jsonRpcError(null, JsonRpcErrorCode.PARSE_ERROR, 'Invalid JSON.'))
      return
    }
    parsed = methodsOf(payload)

    // A client that gives up on a call (closes the request before the
    // reply) cancels it: an approval decided after that no longer executes.
    const connection = new AbortController()
    const onClose = () => {
      if (!response.writableEnded) connection.abort('the client closed the request')
    }
    response.on('close', onClose)

    const registry = registryFor(scope)
    try {
      const reply = await handleJsonRpcPayload(authorization.server, payload, {
        signal: connection.signal,
        cancellations: registry,
      })
      if (connection.signal.aborted) return
      if (reply === null) {
        finish(202)
        return
      }
      finish(200, reply)
    } finally {
      response.off('close', onClose)
      if (registry.size() === 0) registries.delete(scope)
    }
  }
}
