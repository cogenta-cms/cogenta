import { CogentaError, type ErrorCode, isCogentaError } from '@cogenta/core'

/**
 * The transport shape REST is written against.
 *
 * No HTTP framework, and nothing that listens on a port: a request is a plain
 * value in, a plain value out. That is what makes every route testable without
 * starting a server — the same choice `packages/cli` made — and it keeps the
 * Node adapter (and, later, a serverless one) a thin translation rather than a
 * second implementation.
 */
export interface RestRequest {
  readonly method: string
  readonly path: string
  /** Already split by the transport. A repeated key arrives as an array. */
  readonly query: Readonly<Record<string, string | readonly string[] | undefined>>
  /** Already parsed by the transport: this layer never sees a raw body. */
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string | undefined>>
}

export interface RestResponse {
  readonly status: number
  readonly body: unknown
  readonly headers: Readonly<Record<string, string>>
}

/** The only error shape a client ever sees. */
export interface RestErrorBody {
  readonly error: {
    readonly code: ErrorCode
    readonly message: string
    readonly hint?: string
  }
}

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
})

export function jsonResponse(status: number, body: unknown): RestResponse {
  return { status, body, headers: JSON_HEADERS }
}

/**
 * Which HTTP status a stable error code means.
 *
 * Mapping here rather than at each throw site keeps the codes the single
 * source of truth: a new route cannot invent a status for an existing failure.
 */
const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  CONTENT_NOT_FOUND: 404,
  CONTENT_INVALID: 400,
  CONTENT_CONFLICT: 409,
  CONTENT_SLUG_INVALID: 400,
  CONTENT_SLUG_TAKEN: 409,
  CONTENT_SCHEDULE_INVALID: 400,
  SCHEMA_INVALID: 400,
  BLOCK_UNKNOWN: 400,
  BLOCK_INVALID: 400,
  QUERY_INVALID: 400,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  PREVIEW_TOKEN_INVALID: 403,
  PREVIEW_TOKEN_EXPIRED: 403,

  MEDIA_NOT_FOUND: 404,
  MEDIA_INVALID: 400,
  MEDIA_TYPE_REJECTED: 400,

  AUTH_PASSWORD_INVALID: 400,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_TOTP_INVALID: 400,
  AUTH_TOTP_REQUIRED: 401,
  AUTH_WEBAUTHN_FAILED: 401,
  AUTH_SESSION_INVALID: 401,
  AUTH_SESSION_EXPIRED: 401,
  AUTH_RATE_LIMITED: 429,
  AUTH_MFA_REQUIRED: 401,
  AUTH_USER_EXISTS: 409,
  AUTH_USER_NOT_FOUND: 404,
  AUTH_ROLE_UNKNOWN: 400,

  AGENT_UNKNOWN: 404,

  // A verified-broken chain is a server-side integrity failure, not
  // something the caller's request could have avoided — the default 500
  // already fits, spelled out so it is not mistaken for an oversight.
  AUDIT_CHAIN_BROKEN: 500,
}

export function statusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500
}

/**
 * Turns any thrown value into a response.
 *
 * Two rules are load-bearing here. `details` is **never** serialised: it is the
 * structured context meant for logs, and it is the one place a value a caller
 * sent could travel back out. And a non-`CogentaError` is reduced to a fixed
 * sentence, because an unexpected error's message can contain anything at all,
 * including a connection string.
 */
export function errorResponse(error: unknown): RestResponse {
  if (isCogentaError(error)) {
    const body: RestErrorBody = {
      error:
        error.hint === undefined
          ? { code: error.code, message: error.message }
          : { code: error.code, message: error.message, hint: error.hint },
    }
    return jsonResponse(statusFor(error.code), body)
  }

  const internal: RestErrorBody = {
    error: {
      code: 'INTERNAL',
      message: 'The request could not be completed.',
      hint: 'Retry; if it persists, look at the server logs for the matching entry.',
    },
  }
  return jsonResponse(500, internal)
}

export function queryError(parameter: string, reason: string, hint: string): CogentaError {
  // The parameter is named, never its value: naming the value would echo
  // whatever a caller sent straight back into a log, an error page or a cache.
  return new CogentaError({
    code: 'QUERY_INVALID',
    message: `The "${parameter}" query parameter ${reason}.`,
    hint,
    details: { parameter },
  })
}
