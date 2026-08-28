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
    /**
     * The collection field this error is about, when the error has one and
     * the code is one where naming it is safe. Only ever a field *name* the
     * client's own copy of the schema already declares — never a value, an
     * id or anything else a caller sent — which is what makes exposing it
     * different from `details` (see below): a field name is not a secret.
     */
    readonly field?: string
  }
}

/**
 * Codes whose `details.field` (when it names one) is a bare, schema-declared
 * field name — safe for a client to key its per-field validation UI off
 * (fiche 02 task 3). Deliberately a short, explicit list rather than "any
 * code with a `field` key": `details` is per-call-site free-form context, and
 * a future call site could reuse the key `field` for something that means
 * "a query parameter" or anything else not meant to leave the server.
 */
const FIELD_NAMING_CODES: ReadonlySet<ErrorCode> = new Set([
  'CONTENT_INVALID',
  'CONTENT_SLUG_INVALID',
  // Forms (ADR-0026): lets the public, no-JavaScript page mark exactly the
  // one field that failed with `aria-invalid`/`aria-describedby`, rather
  // than a form-wide error banner a screen reader user has to hunt for.
  'FORM_SUBMISSION_INVALID',
  'FORM_CONSENT_REQUIRED',
])

function fieldOf(error: CogentaError): string | undefined {
  if (!FIELD_NAMING_CODES.has(error.code)) return undefined
  const field = error.details?.field
  return typeof field === 'string' ? field : undefined
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
  // Concurrent editing (fiche 02 task 7): the request is well-formed, it is
  // the live row's state that no longer matches what the write assumed.
  CONTENT_STALE_WRITE: 409,
  // The trash (`schema@2.0`, ADR-0022). Both are conflicts with the state the
  // entry is actually in, not malformed requests: the client asked for
  // something coherent that the current state forbids.
  CONTENT_REFERENCED: 409,
  CONTENT_NOT_TRASHED: 409,

  // Editorial workflow (`schema@2.1`, ADR-0027). A collection that never
  // turned the workflow on has nothing to transition; an illegal jump (e.g.
  // approving an entry nobody submitted) is a conflict with its current
  // `reviewState`, not a malformed request.
  CONTENT_WORKFLOW_DISABLED: 409,
  CONTENT_REVIEW_TRANSITION_INVALID: 409,

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
  MENU_LOCATION_TAKEN: 409,
  MENU_ITEM_NOT_FOUND: 404,
  MENU_ITEM_INVALID: 400,
  MENU_CYCLE: 400,

  // Patterns — the page builder's motif/model library (fiche 43 sub-chantier A)
  PATTERN_UNKNOWN: 404,
  PATTERN_INVALID: 400,

  // Role permission overrides (fiche 63, ADR-0028)
  ROLE_PERMISSION_TARGET_UNKNOWN: 404,
  ROLE_PERMISSION_INVALID: 400,
  ROLE_PERMISSION_EXPORT_INVALID: 400,

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

  // Account lifecycle (fiche 17: invitations and anonymization). Both invite
  // codes describe a conflict with the account's *current* state, not a
  // malformed request — resending/cancelling only ever makes sense for a row
  // still sitting in "invited" — so 409, the same reasoning `CONTENT_REFERENCED`
  // already gets. `AUTH_INVITE_UNAVAILABLE` mirrors `ASSIST_UNAVAILABLE`: the
  // route exists, this site simply has no email transport wired (R1). A typed
  // confirmation that does not match is the caller's input being wrong, same
  // shape as `AUTH_RESET_TOKEN_INVALID`.
  AUTH_INVITE_UNAVAILABLE: 503,
  AUTH_INVITE_INVALID_STATE: 409,
  AUTH_ACCOUNT_ANONYMIZED: 409,
  AUTH_ANONYMIZE_CONFIRMATION_MISMATCH: 400,

  // API keys (L13 task 8)
  API_KEY_INVALID: 401,
  API_KEY_REVOKED: 401,
  API_KEY_EXPIRED: 401,
  API_KEY_NOT_FOUND: 404,
  // API keys — lifecycle and request quota (fiche 20). A key that is
  // revoked or expired cannot be rotated: the id names something real, so a
  // 409 (conflict with its current state) fits better than a 404.
  API_KEY_ROTATION_INVALID: 409,
  // The key authenticated successfully; it is simply over its quota for this
  // window. `createRequestListener` (cogenta serve) is what actually turns
  // this into `Retry-After`/`RateLimit-*` headers, since `errorResponse`
  // deliberately never serialises `details` onto the wire.
  API_KEY_RATE_LIMITED: 429,

  AGENT_UNKNOWN: 404,
  // Pre-existing (L5), never mapped before — a malformed create/update body
  // is the caller's fault, same shape as `CONTENT_INVALID`.
  AGENT_DEFINITION_INVALID: 400,
  // L22 task 1: the real, persistent agent runtime. `AGENT_DUPLICATE`/
  // `AGENT_BUILTIN_UNDELETABLE`/`AGENT_DISABLED` are all conflicts with the
  // registry's current state, not malformed requests — same reasoning
  // `AUTH_USER_EXISTS`/`CONTENT_REFERENCED` already use. `AGENT_NO_PROVIDER`
  // mirrors `SITE_PLAN_NO_PROVIDER` exactly: nothing is broken, this run
  // simply has no configured LLM provider to use (R2). `AGENT_REGISTRY_
  // READ_ONLY` is the same "capability not offered by this instance" shape.
  // `AGENT_RUNTIME_UNAVAILABLE` mirrors `ASSIST_UNAVAILABLE`'s 503 instead:
  // a whole live runner is missing, not one optional capability of it.
  AGENT_DUPLICATE: 409,
  AGENT_DISABLED: 409,
  AGENT_NO_PROVIDER: 501,
  AGENT_BUILTIN_UNDELETABLE: 409,
  PROVIDER_NOT_CONFIGURED: 404,
  AGENT_SKILL_UNKNOWN: 404,
  AGENT_SKILL_DUPLICATE: 409,
  AGENT_SKILL_BUILTIN_UNDELETABLE: 409,
  AGENT_REGISTRY_READ_ONLY: 501,
  AGENT_RUNTIME_UNAVAILABLE: 503,
  // Skill reference folders (fiche 57). An invalid path is the caller's
  // fault (400); a path that names nothing to remove is a plain 404.
  AGENT_SKILL_RESOURCE_INVALID: 400,
  AGENT_SKILL_RESOURCE_UNKNOWN: 404,
  // MCP external connection registry (fiche 58 tasks 2/3) —
  // `mcp-connections-router.ts`. `MCP_CONNECTION_CONFIRMATION_REQUIRED` and
  // `MCP_CONNECTION_TOOL_NOT_DISCOVERED` are 400s, not 403s: the caller
  // themselves is already admin (`requireAdmin` throws its own `FORBIDDEN`
  // first) — what is wrong is the *request*, missing the mandatory
  // confirmation or naming a tool never actually discovered on the wire.
  MCP_CONNECTION_NOT_FOUND: 404,
  MCP_CONNECTION_INVALID: 400,
  MCP_CONNECTION_AUTH_INVALID: 400,
  MCP_CONNECTION_CONFIRMATION_REQUIRED: 400,
  MCP_CONNECTION_TOOL_NOT_DISCOVERED: 400,
  // Raised by `parseSkillFile` (`@cogenta/agents`) — a malformed `SKILL.md`
  // submitted as-is (L24 task 4's `/api/agent-skills` `content` field) is a
  // bad request, the same shape as any other `*_INVALID` input error below.
  SKILL_DEFINITION_INVALID: 400,

  // Notice channel settings (fiche 38 tasks 3-4), reusing `@cogenta/channels`'
  // own error codes rather than inventing new ones for the same failures.
  CHANNEL_UNKNOWN: 404,
  CHANNEL_PREFERENCES_INVALID: 400,

  // Prompt Settings (fiche 45) — same shape as `AGENT_SKILL_*` above: an
  // unknown id is a 404, a conflict with the store's current state (a
  // duplicate name, a builtin an admin tried to delete) is a 409, and a
  // malformed create/update body is the caller's fault (400).
  PROMPT_TEMPLATE_UNKNOWN: 404,
  PROMPT_TEMPLATE_DUPLICATE: 409,
  PROMPT_TEMPLATE_BUILTIN_UNDELETABLE: 409,
  PROMPT_TEMPLATE_INVALID: 400,
  // Only ever thrown by `@cogenta/agents`' `resolveInstruction`/
  // `renderPromptTemplate`, deep inside an `assist.*` tool call — never by
  // this router directly — but listed here so `statusFor` has a real answer
  // rather than the 500 fallback if it ever surfaces on the wire.
  PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED: 400,

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
  // Fiche 30 task 3's spending cap. Same status as `PROVIDER_RATE_LIMITED` —
  // "try again later" is the accurate instruction for both.
  ASSIST_BUDGET_EXCEEDED: 429,
  // A reference document id that does not exist on this site (L22 task 4) —
  // an ordinary 404, the same as `AUDIT_ENTRY_NOT_FOUND`.
  ASSIST_DOCUMENT_NOT_FOUND: 404,
  TOOL_UNKNOWN: 404,
  TOOL_INPUT_INVALID: 400,
  TOOL_CALL_REJECTED: 403,
  PROVIDER_UNKNOWN: 503,
  PROVIDER_REQUEST_FAILED: 502,
  PROVIDER_RESPONSE_INVALID: 502,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_RATE_LIMITED: 429,
  // Provider catalog (fiche 56) — both describe a malformed write, never a
  // server fault.
  PROVIDER_ID_INVALID: 400,
  PROVIDER_CUSTOM_BASE_URL_REQUIRED: 400,

  // A verified-broken chain is a server-side integrity failure, not
  // something the caller's request could have avoided — the default 500
  // already fits, spelled out so it is not mistaken for an oversight.
  AUDIT_CHAIN_BROKEN: 500,
  // Looking an audit entry up by id and finding nothing is an ordinary 404,
  // unlike the line above.
  AUDIT_ENTRY_NOT_FOUND: 404,

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
  // Fiche 29 task 5 — same shape as the signature checks above: the caller's
  // request was well-formed, the referenced version just does not satisfy
  // this installation's engine range.
  MARKETPLACE_ENGINE_INCOMPATIBLE: 422,

  // Site settings (fiche 23, ADR-0025). An unknown key is a plain 404 — the
  // registry is the whole vocabulary; a value that fails that key's own
  // schema is the caller's fault (400).
  SITE_SETTING_UNKNOWN: 404,
  SITE_SETTING_INVALID: 400,

  // Admin theme (L21 task 2). A `templateId` outside the two built-ins and an
  // override the schema does not declare are both the caller's fault (400) —
  // unlike a settings key, a template is not a registry an install extends,
  // so there is no "not found" resource sense to reach for here.
  ADMIN_THEME_TEMPLATE_UNKNOWN: 400,
  ADMIN_THEME_INVALID: 400,

  // Migrations, surfaced through the health screen (fiche 24 task 2). A
  // destructive/checksum/lock refusal is a conflict with the database's own
  // state, not a malformed request; a plain failure keeps the default 500.
  MIGRATION_DESTRUCTIVE: 409,
  MIGRATION_LOCKED: 409,
  MIGRATION_CHECKSUM_MISMATCH: 409,

  // Maintenance tools (fiche 24 task 3). An unknown tool id or run id is the
  // caller's fault, same shape as `AGENT_UNKNOWN`.
  MAINT_TOOL_UNKNOWN: 404,
  MAINT_TOOL_RUN_NOT_FOUND: 404,
  MAINT_TOOL_INPUT_INVALID: 400,

  // Scheduled tasks (fiche 28). Same shape as the maintenance tools above:
  // an unknown task or job id is the caller's fault, not a server fault.
  SCHEDULER_TASK_UNKNOWN: 404,
  SCHEDULER_TASK_DUPLICATE: 409,
  SCHEDULER_QUEUE_JOB_NOT_FOUND: 404,
  SCHEDULER_QUEUE_JOB_NOT_RETRYABLE: 409,

  // Theme (fiche 14) and the contract D skin validation it reuses
  // (`@cogenta/render`'s `validateSkin`). Every `SKIN_*` code names a
  // well-formed request whose resulting skin still fails contract D — 422,
  // not 400: nothing about the request's *shape* was wrong.
  SKIN_TOKEN_MISSING: 422,
  SKIN_TOKEN_UNKNOWN: 422,
  SKIN_TOKEN_INVALID: 422,
  SKIN_CONTRAST_INSUFFICIENT: 422,
  SKIN_SCALE_NOT_MONOTONIC: 422,
  SKIN_MOTION_NOT_REDUCED: 422,
  THEME_OVERRIDE_INVALID: 422,
  THEME_SKIN_NOT_FOUND: 404,
  // `activeTheme` naming a package this instance has no registry entry for
  // (fiche L23) — the same status every other `*_NOT_FOUND` in this table
  // uses, and the same code `@cogenta/render`'s `loadTheme` already throws
  // for the equivalent case on the Astro build path.
  THEME_NOT_FOUND: 404,
  // Same shape as `SITE_PLAN_NO_PROVIDER`: nothing is broken, this instance
  // simply has no LLM provider configured (R2).
  THEME_NO_PROVIDER: 501,
  // Same shape as `CONTENT_READ_ONLY`: the write this instance refuses is
  // one an admin is otherwise permitted to make — ADR-0010's rule, applied
  // to the theme file rather than the schema file.
  THEME_EXPORT_NOT_ALLOWED: 409,

  // Import (fiche 25): preview/apply/undo, CSV, RSS/Atom.
  IMPORT_RUN_NOT_FOUND: 404,
  IMPORT_SOURCE_INVALID: 400,
  IMPORT_ALREADY_APPLIED: 409,
  IMPORT_MAPPING_INVALID: 400,
  IMPORT_MEDIA_URL_UNSAFE: 400,
  IMPORT_CSV_INVALID: 400,
  IMPORT_FEED_INVALID: 400,
  IMPORT_WXR_PARSE_FAILED: 400,
  IMPORT_WXR_UNSAFE_DOCUMENT: 400,

  // Forms — contract G (ADR-0026, fiche 16).
  FORM_UNKNOWN: 404,
  FORM_SUBMISSION_NOT_FOUND: 404,
  FORM_NAME_TAKEN: 409,
  FORM_DEFINITION_INVALID: 400,
  FORM_SUBMISSION_INVALID: 400,
  FORM_CONSENT_REQUIRED: 400,
  // A well-formed request the form's own current state refuses — the same
  // shape as `CONTENT_READ_ONLY`, not a malformed request.
  FORM_DISABLED: 409,
  FORM_RATE_LIMITED: 429,
  // Both look identical to whoever (or whatever) triggered them: a plain
  // rejection, never a signal that names *why* — telling a bot precisely
  // which defence it tripped only helps it route around that one next time.
  FORM_HONEYPOT_TRIGGERED: 400,
  FORM_SUBMITTED_TOO_FAST: 400,
  FORM_AUTORESPONDER_RATE_LIMITED: 429,
  // Fiche 47 — logic, steps, files, multi-channel notifications, CAPTCHA.
  FORM_FILE_REJECTED: 400,
  FORM_CAPTCHA_REQUIRED: 400,
  FORM_CAPTCHA_FAILED: 400,
  FORM_STEP_INVALID: 400,
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
    const field = fieldOf(error)
    const body: RestErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.hint === undefined ? {} : { hint: error.hint }),
        ...(field === undefined ? {} : { field }),
      },
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
