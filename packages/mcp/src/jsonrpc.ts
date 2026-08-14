/**
 * MCP is JSON-RPC 2.0 — this is that envelope, and only that envelope. R9:
 * the official `@modelcontextprotocol/sdk` was audited and rejected for
 * this — it pulls express, hono, ajv, jose and cross-spawn (100+ transitive
 * packages, 4.3MB) to expose three methods (`initialize`, `tools/list`,
 * `tools/call`); this package hand-rolls exactly that subset instead.
 */
export interface JsonRpcRequest {
  readonly jsonrpc: '2.0'
  readonly id: string | number | null
  readonly method: string
  readonly params?: Readonly<Record<string, unknown>>
}

export interface JsonRpcSuccess {
  readonly jsonrpc: '2.0'
  readonly id: string | number | null
  readonly result: unknown
}

export interface JsonRpcErrorPayload {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

export interface JsonRpcError {
  readonly jsonrpc: '2.0'
  readonly id: string | number | null
  readonly error: JsonRpcErrorPayload
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError

/** The JSON-RPC 2.0 reserved codes this server actually raises. */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_PARAMS: -32602,
  METHOD_NOT_FOUND: -32601,
} as const

export function jsonRpcSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result }
}

export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }
}
