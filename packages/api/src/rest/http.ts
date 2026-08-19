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
  // Redirects (admin screen over `RedirectStore`). A loop or a self-redirect
  // is a conflict with the table's own rows, not a malformed request; an
  // unknown "from" is a plain 404.
  CONTENT_ROUTE_INVALID: 400,
  CONTENT_REDIRECT_LOOP: 409,
  REDIRECT_UNKNOWN: 404,
  // Not FORBIDDEN (403 for "you may never do this"): a read-only instance
  // refuses a write an actor is otherwise permitted to make — 403 is still
  // the closest real status (the request is understood, authenticated where
  // needed, and refused on policy, not on the request's shape).
  CONTENT_READ_ONLY: 403,
  // The trash (`schema@2.0`, ADR-0022). Both are conflicts with the state the
  // entry is actually in, not malformed requests: the client asked for
  // something coherent that the current state forbids.
  CONTENT_REFERENCED: 409,
  CONTENT_NOT_TRASHED: 409,

  // Taxonomies (`schema@2.0`, ADR-0022)
  TAXONOMY_UNKNOWN: 404,
  TAXONOMY_TERM_NOT_FOUND: 404,
  TAXONOMY_SLUG_TAKEN: 409,
  TAXONOMY_TERM_HAS_CHILDREN: 409,
  // These three describe a request that could never be right, whatever the
  // stored state: a cycle, a tree too deep to store, a parent in a flat
  // taxonomy.
  TAXONOMY_CYCLE: 400,
  TAXONOMY_TOO_DEEP: 400,
  TAXONOMY_NOT_HIERARCHICAL: 400,

  // Menus (navigation)
  MENU_UNKNOWN: 404,
  MENU_NAME_TAKEN: 409,
  MENU_ITEM_NOT_FOUND: 404,
  MENU_ITEM_INVALID: 400,
  MENU_CYCLE: 400,

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
  AUTH_RESET_TOKEN_INVALID: 400,
  AUTH_ROLE_UNKNOWN: 400,
  // Recovery codes (fiche 18 task 1). A wrong or already-consumed code is the
  // same shape of failure as a wrong password. "Unavailable" is a conflict
  // with the account's current state (no confirmed TOTP to be a spare key
  // for), not a malformed request.
  AUTH_RECOVERY_CODE_INVALID: 401,
  AUTH_RECOVERY_CODES_UNAVAILABLE: 409,

  // API keys (L13 task 8)
  API_KEY_INVALID: 401,
  API_KEY_REVOKED: 401,
  API_KEY_EXPIRED: 401,
  API_KEY_NOT_FOUND: 404,

  AGENT_UNKNOWN: 404,

  // Site plans (L19). A missing draft is a 404; an undecided item and an
  // unknown decision id are both the caller's fault (400); "no provider
  // configured" is 501 rather than 500 — nothing is broken, this instance
  // simply does not offer the capability (R2).
  SITE_PLAN_DRAFT_NOT_FOUND: 404,
  SITE_PLAN_DECISION_MISSING: 400,
  SITE_PLAN_DECISION_UNKNOWN_ITEM: 400,
  SITE_PLAN_CONSTRAINT_VIOLATED: 400,
  SITE_PLAN_NO_PROVIDER: 501,
  SITE_BRIEF_GENERATION_FAILED: 502,
  SITE_BRIEF_RESPONSE_INVALID: 502,
  CONTENT_MODEL_PROPOSAL_INVALID: 502,
  SKIN_CANDIDATES_INSUFFICIENT: 502,
  DOCUMENT_FORMAT_UNSUPPORTED: 400,
  DOCUMENT_TOO_LARGE: 413,
  DOCUMENT_EXTRACTION_FAILED: 400,
  DOCUMENT_NO_TEXT_LAYER: 400,

  // Assistant (L18). `ASSIST_UNAVAILABLE` is a 503 rather than a 404: the route
  // exists, the site simply configured no provider, and saying so plainly is
  // what lets a client tell "switched off" from "you got the URL wrong".
  ASSIST_UNAVAILABLE: 503,
  // The model answered with something unusable. That is an upstream failure the
  // caller cannot fix by changing their request.
  ASSIST_RESPONSE_INVALID: 502,
  TOOL_UNKNOWN: 404,
  TOOL_INPUT_INVALID: 400,
  TOOL_CALL_REJECTED: 403,
  PROVIDER_UNKNOWN: 503,
  PROVIDER_REQUEST_FAILED: 502,
  PROVIDER_RESPONSE_INVALID: 502,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_RATE_LIMITED: 429,

  // A verified-broken chain is a server-side integrity failure, not
  // something the caller's request could have avoided — the default 500
  // already fits, spelled out so it is not mistaken for an oversight.
  AUDIT_CHAIN_BROKEN: 500,

  // Marketplace (L17) and the `@cogenta/plugins` verification it reuses.
  // A missing/invalid signature is the caller's install attempt failing a
  // real check, not a server fault — 422 (the request was well-formed, the
  // referenced package just doesn't pass verification), not 500.
  PLUGIN_SIGNATURE_MISSING: 422,
  PLUGIN_SIGNATURE_INVALID: 422,
  PLUGIN_SOURCE_NOT_FOUND: 404,
  PLUGIN_MANIFEST_INVALID: 422,
  MARKETPLACE_ITEM_NOT_FOUND: 404,
  MARKETPLACE_KIND_UNSUPPORTED: 400,
  MARKETPLACE_ALREADY_INSTALLED: 409,
  MARKETPLACE_NOT_INSTALLED: 404,
  // Never a silent apply: the caller must retry with explicit confirmation,
  // which is a conflict with the item's current pending-permission state,
  // not a malformed request.
  MARKETPLACE_UPDATE_REQUIRES_APPROVAL: 409,
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
