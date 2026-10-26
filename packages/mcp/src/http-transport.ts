import type { IncomingMessage, ServerResponse } from 'node:http'
import { JsonRpcErrorCode, type JsonRpcNotification, jsonRpcError } from './jsonrpc.js'
import {
  createCancellationRegistry,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  type McpCancellationRegistry,
  type McpServer,
} from './server.js'

/**
 * MCP's Streamable HTTP transport, the stateless subset of it: every message
 * is one `POST`. No session id is issued and no standalone SSE stream is
 * offered (`GET` answers 405, which the specification allows), so a server
 * restart, a second replica or a load balancer changes nothing for a
 * client — each request authenticates and stands on its own.
 *
 * The reply is one JSON body, except for a `tools/call` from a client that
 * accepts `text/event-stream` (the official SDKs always do): that reply is a
 * short SSE stream — progress notifications while the call waits (a write
 * waiting for a human can take minutes), a keep-alive comment every 15 s so
 * no proxy closes an idle connection, then the response. Both shapes are
 * what the specification lets a server choose per request.
 *
 * Authentication is the caller's (`authorize`), and it runs on **every**
 * request, before the body is read: a key revoked a second ago is refused on
 * the next message, not at the next connection.
 *
 * One message per request: JSON-RPC batches were removed from MCP in the
 * 2025-06-18 revision, and over HTTP a batch would turn one request — one
 * unit of the key's per-minute quota — into thousands of tool calls.
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
  /** The JSON-RPC method of the message, when it named a plausible one. */
  readonly method: string | null
  /** The tool a `tools/call` named, when it is a plausible tool name. */
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
  /** How often an SSE reply sends a keep-alive comment. 15 s by default. */
  readonly keepAliveMs?: number
}

export type McpHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024
const DEFAULT_KEEP_ALIVE_MS = 15_000
/** What a method or tool name may look like to be logged as is — anything else is a client's free text. */
const LOGGABLE_NAME = /^[\w./-]{1,64}$/u

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

function describe(payload: unknown): { method: string | null; tool: string | null } {
  if (typeof payload !== 'object' || payload === null) return { method: null, tool: null }
  const raw = (payload as Record<string, unknown>)['method']
  const method = typeof raw === 'string' && LOGGABLE_NAME.test(raw) ? raw : null
  const params = (payload as Record<string, unknown>)['params']
  const name =
    method === 'tools/call' && typeof params === 'object' && params !== null
      ? (params as Record<string, unknown>)['name']
      : undefined
  return { method, tool: typeof name === 'string' && LOGGABLE_NAME.test(name) ? name : null }
}

function acceptsEventStream(request: IncomingMessage): boolean {
  const accept = request.headers.accept
  return typeof accept === 'string' && accept.toLowerCase().includes('text/event-stream')
}

function isToolCall(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as Record<string, unknown>)['method'] === 'tools/call' &&
    'id' in payload
  )
}

export function createMcpHttpHandler(options: McpHttpHandlerOptions): McpHttpHandler {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS
  /**
   * One cancellation registry per caller, kept while that caller has a
   * request in flight — counted by request, not by registered call: a
   * `tools/call` that has not registered yet (still loading its tools) must
   * not see its registry dropped by a `ping` finishing next to it, or its
   * later `notifications/cancelled` would land in a fresh, empty one.
   */
  const scopes = new Map<string, { registry: McpCancellationRegistry; active: number }>()

  function enter(scope: string): McpCancellationRegistry {
    const existing = scopes.get(scope)
    if (existing !== undefined) {
      existing.active += 1
      return existing.registry
    }
    const created = { registry: createCancellationRegistry(), active: 1 }
    scopes.set(scope, created)
    return created.registry
  }

  function leave(scope: string): void {
    const entry = scopes.get(scope)
    if (entry === undefined) return
    entry.active -= 1
    if (entry.active <= 0) scopes.delete(scope)
  }

  return async (request, response) => {
    const started = Date.now()
    let scope: string | null = null
    let described: { method: string | null; tool: string | null } = { method: null, tool: null }
    const record = (status: number) =>
      options.onRequest?.({
        scope,
        status,
        method: described.method,
        tool: described.tool,
        durationMs: Date.now() - started,
      })
    const finish = (status: number, body?: unknown, headers?: Readonly<Record<string, string>>) => {
      send(response, status, body, headers)
      record(status)
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
        jsonRpcError(
          null,
          JsonRpcErrorCode.INVALID_REQUEST,
          'This origin may not call the MCP endpoint.',
        ),
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
          `Unsupported MCP-Protocol-Version. Supported: ${MCP_SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`,
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
        jsonRpcError(
          null,
          JsonRpcErrorCode.INVALID_REQUEST,
          'Send the message as application/json.',
        ),
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
    if (Array.isArray(payload)) {
      finish(
        400,
        jsonRpcError(
          null,
          JsonRpcErrorCode.INVALID_REQUEST,
          'Send one JSON-RPC message per request: batches are not accepted over HTTP.',
        ),
      )
      return
    }
    described = describe(payload)

    // A client that gives up on a call (closes the request before the
    // reply) cancels it: an approval decided after that no longer executes.
    const connection = new AbortController()
    let replied = false
    const onClose = () => {
      if (!replied) connection.abort('the client closed the request')
    }
    response.on('close', onClose)

    const registry = enter(scope)
    const streamed = isToolCall(payload) && acceptsEventStream(request)
    let keepAlive: NodeJS.Timeout | undefined
    const writeEvent = (message: unknown): void => {
      if (response.writableEnded || response.destroyed) return
      response.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`)
    }
    if (streamed) {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        // nginx buffers proxied responses unless told not to.
        'x-accel-buffering': 'no',
      })
      keepAlive = setInterval(() => {
        if (!response.writableEnded && !response.destroyed) response.write(': keep-alive\n\n')
      }, keepAliveMs)
      keepAlive.unref?.()
    }

    try {
      const reply = await authorization.server.handle(payload, {
        signal: connection.signal,
        cancellations: registry,
        ...(streamed
          ? { notify: (notification: JsonRpcNotification) => writeEvent(notification) }
          : {}),
      })
      replied = true
      // 499, nginx's "client closed request": logged, never sent — nobody is listening.
      if (connection.signal.aborted) {
        record(499)
        return
      }
      if (streamed) {
        if (reply !== null) writeEvent(reply)
        response.end()
        record(200)
        return
      }
      if (reply === null) {
        finish(202)
        return
      }
      finish(200, reply)
    } finally {
      replied = true
      if (keepAlive !== undefined) clearInterval(keepAlive)
      response.off('close', onClose)
      leave(scope)
    }
  }
}
