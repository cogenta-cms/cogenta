import {
  type AccessContext,
  errorResponse,
  jsonResponse,
  type RestRequest,
  type RestResponse,
} from '@cogenta/api'
import type { AuditEntry, AuditLog } from '@cogenta/auth'
import { CogentaError, type Logger } from '@cogenta/core'
import { createMcpToolSource, type McpIdentity, type McpSiteToolsOptions } from './mcp-tools.js'

/**
 * `GET /api/mcp/actions/{auditId}` and `POST /api/mcp/actions/{auditId}/revert`
 * — the way an administrator undoes what an MCP client did (L42, R6).
 *
 * An autonomous API key runs reversible writes without approval, so the
 * journal is where a person looks afterwards, and where they must be able to
 * take an action back. Every tool that can be undone has a `revert(receipt)`;
 * the receipt is the output the call returned, which the audit record of the
 * call keeps (`mcp-receipt.ts`). This route is the one thing that reads it
 * back.
 *
 * - **A person, never a key.** The caller must hold the `admin` role through a
 *   sign-in session. An API key — whatever its scope — is refused, so an agent
 *   cannot undo (or redo) through itself, and nothing an agent holds can erase
 *   what it did.
 * - **As that person.** The undo runs through the same tool assembly, service
 *   and permission checks as every other call, with the administrator's roles:
 *   the host's rules still apply, and the tool itself refuses
 *   (`TOOL_REVERT_REFUSED`, 409) rather than guess when what it would undo was
 *   edited since.
 * - **Journalled, once, intent first.** The undo is its own audit entry
 *   (`agent.tool.<tool>.revert`, `revertOf` naming the original). The journal
 *   is written *before* the undo runs (`phase: 'started'`): if it cannot be
 *   written, nothing is undone (`AUDIT_WRITE_FAILED`, 503) — an undo nobody
 *   could trace is worse than an undo that did not happen. The outcome follows
 *   as a second entry (`ok: true` / `ok: false`); an entry already undone is
 *   refused (`RECEIPT_ALREADY_REVERTED`), so a double click or a second
 *   administrator cannot undo twice. A refused undo is journalled with
 *   `ok: false` and does not count as undone. If the outcome entry itself
 *   cannot be written after a successful undo, the response is an error that
 *   says so (the undo ran; do not repeat it) and this process remembers the
 *   entry as undone.
 */

type Actor = AccessContext['actor']

export interface McpUndoOptions {
  /** The same assembly `/api/mcp` serves: collections, services, permissions, stores. */
  readonly tools: Omit<McpSiteToolsOptions, 'transport'>
  readonly auditLog: AuditLog
  readonly logger: Logger
}

export interface McpUndoRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

/** Why an entry cannot be undone, for the screen to word. */
export type McpUndoUnavailable = 'not-mcp' | 'failed' | 'no-receipt' | 'not-reversible'

export type McpUndoState =
  | { readonly state: 'available' }
  | {
      readonly state: 'reverted'
      readonly revertedAt: string
      readonly revertAuditId: string
      readonly revertedBy: string | null
    }
  | { readonly state: 'unavailable'; readonly reason: McpUndoUnavailable }

const BASE = '/api/mcp/actions'
const REVERT_SUFFIX = '.revert'
/** How many later undo entries are read to know whether one names this call. */
const REVERT_LOOKUP_LIMIT = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function routeNotFound(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The routes are GET /api/mcp/actions/{id} and POST /api/mcp/actions/{id}/revert.',
  })
}

function methodNotAllowed(allowed: string): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed },
  }
}

/** The administrator at the screen: a sign-in session holding `admin`. Never an API key. */
function requireAdminSession(actor: Actor): string {
  if (actor.id === null) {
    throw new CogentaError({
      code: 'UNAUTHENTICATED',
      message: 'Sign in to undo an action.',
      hint: 'Send "Authorization: Bearer <token>" from an administrator session.',
    })
  }
  if (actor.id.startsWith('apikey:')) {
    throw new CogentaError({
      code: 'FORBIDDEN',
      message: 'An API key cannot undo actions: only an administrator signed in can.',
      hint: 'Undo it from the audit log of the administration, signed in as an administrator.',
    })
  }
  if (!actor.roles.includes('admin')) {
    throw new CogentaError({
      code: 'FORBIDDEN',
      message: 'Only the admin role may undo an action an MCP client took.',
      hint: 'Ask someone with the admin role to undo it.',
    })
  }
  return actor.id
}

/** The tool an MCP audit record names, or `null` when the entry is not a call made over MCP. */
function mcpToolOf(entry: AuditEntry): string | null {
  const diff = entry.diff
  if (diff === null || diff['origin'] !== 'mcp') return null
  const tool = diff['tool']
  if (typeof tool !== 'string' || entry.action !== `agent.tool.${tool}`) return null
  return tool
}

export function createMcpUndoRouter(options: McpUndoOptions): McpUndoRouter {
  const { auditLog, logger } = options
  // One undo of one entry at a time in this process: the "already undone"
  // check reads the journal, so two requests racing would both pass it.
  const inFlight = new Set<string>()
  // Entries undone whose outcome could not be written to the journal: the
  // journal cannot say so, this process can, until it restarts.
  const undoneUnjournalled = new Map<string, string>()

  function sourceFor(administrator: Actor) {
    const identity: McpIdentity = {
      actor: { id: administrator.id, roles: administrator.roles },
      authenticated: true,
      label: 'admin session',
    }
    return createMcpToolSource({ ...options.tools, transport: 'http' }, async () => identity)
  }

  async function entryOrThrow(id: string): Promise<AuditEntry> {
    const entry = await auditLog.get(id)
    if (entry === null) {
      throw new CogentaError({
        code: 'AUDIT_ENTRY_NOT_FOUND',
        message: `No audit entry has id "${id}".`,
        hint: 'Check the id against a recent GET /api/audit listing.',
      })
    }
    return entry
  }

  /** The undo that succeeded for this entry, when there is one. */
  async function revertOf(entry: AuditEntry, tool: string): Promise<AuditEntry | null> {
    const later = await auditLog.list({
      action: `agent.tool.${tool}${REVERT_SUFFIX}`,
      since: entry.at,
      limit: REVERT_LOOKUP_LIMIT,
    })
    return (
      later.find(
        (candidate) => candidate.diff?.['revertOf'] === entry.id && candidate.diff['ok'] === true,
      ) ?? null
    )
  }

  async function inspect(
    entry: AuditEntry,
    source: ReturnType<typeof sourceFor>,
  ): Promise<{ readonly tool: string | null; readonly state: McpUndoState }> {
    const tool = mcpToolOf(entry)
    if (tool === null) return { tool, state: { state: 'unavailable', reason: 'not-mcp' } }
    if (entry.diff?.['ok'] !== true) {
      return { tool, state: { state: 'unavailable', reason: 'failed' } }
    }
    if (!isRecord(entry.diff['output'])) {
      return { tool, state: { state: 'unavailable', reason: 'no-receipt' } }
    }
    const unjournalled = undoneUnjournalled.get(entry.id)
    if (unjournalled !== undefined) {
      return {
        tool,
        state: {
          state: 'reverted',
          revertedAt: new Date().toISOString(),
          revertAuditId: unjournalled,
          revertedBy: null,
        },
      }
    }
    const done = await revertOf(entry, tool)
    if (done !== null) {
      return {
        tool,
        state: {
          state: 'reverted',
          revertedAt: done.at,
          revertAuditId: done.id,
          revertedBy: done.actorId,
        },
      }
    }
    if (!(await source.canRevert(tool))) {
      return { tool, state: { state: 'unavailable', reason: 'not-reversible' } }
    }
    return { tool, state: { state: 'available' } }
  }

  async function recordUndo(
    entry: AuditEntry,
    tool: string,
    administrator: Actor,
    outcome:
      | { readonly phase: 'started' }
      | { readonly ok: true }
      | { readonly ok: false; readonly error: string },
  ): Promise<AuditEntry | null> {
    try {
      return await auditLog.record({
        actorId: administrator.id,
        actorRoles: administrator.roles,
        action: `agent.tool.${tool}${REVERT_SUFFIX}`,
        ...(entry.collection === null ? {} : { collection: entry.collection }),
        ...(entry.entryId === null ? {} : { entryId: entry.entryId }),
        diff: { origin: 'mcp-undo', tool, revertOf: entry.id, ...outcome },
      })
    } catch (error) {
      logger.error('MCP undo audit write failed', { error: String(error), revertOf: entry.id })
      return null
    }
  }

  async function revert(id: string, administrator: Actor): Promise<RestResponse> {
    if (inFlight.has(id)) {
      throw new CogentaError({
        code: 'CONTENT_CONFLICT',
        message: 'This action is already being undone.',
        hint: 'Wait a moment and reload the audit log.',
      })
    }
    inFlight.add(id)
    try {
      const entry = await entryOrThrow(id)
      const source = sourceFor(administrator)
      const { tool, state } = await inspect(entry, source)
      if (tool === null || state.state === 'unavailable') {
        const reason = state.state === 'unavailable' ? state.reason : 'not-mcp'
        if (reason === 'not-mcp') {
          throw new CogentaError({
            code: 'RECEIPT_UNKNOWN',
            message: 'This journal entry is not a tool call made over MCP.',
            hint: 'Only actions an MCP client took can be undone from here.',
          })
        }
        throw new CogentaError({
          code: 'RECEIPT_NOT_REVERTIBLE',
          message:
            reason === 'failed'
              ? 'This call failed, so there is nothing to undo.'
              : reason === 'no-receipt'
                ? 'The journal did not keep what this call returned, so it cannot be undone.'
                : `"${tool}" cannot be undone.`,
          hint: 'Only a call that succeeded, on a tool that can be undone and that your account may use, can be reverted.',
        })
      }
      if (state.state === 'reverted') {
        throw new CogentaError({
          code: 'RECEIPT_ALREADY_REVERTED',
          message: 'This action was already undone.',
          hint: `The undo is entry ${state.revertAuditId} of the audit log.`,
        })
      }

      // Intent first: the undo changes the site, so the journal must be able
      // to say who asked before it happens. No record, no undo.
      const started = await recordUndo(entry, tool, administrator, { phase: 'started' })
      if (started === null) {
        throw new CogentaError({
          code: 'AUDIT_WRITE_FAILED',
          message: 'The audit log could not be written, so the action was not undone.',
          hint: 'Nothing was changed. Check the database and the disk space of the site, then try again.',
        })
      }

      const receipt = entry.diff?.['output']
      try {
        await source.revert(tool, receipt)
      } catch (error) {
        await recordUndo(entry, tool, administrator, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      const recorded = await recordUndo(entry, tool, administrator, { ok: true })
      logger.info('mcp action undone', {
        tool,
        revertOf: entry.id,
        by: administrator.id,
      })
      if (recorded === null) {
        undoneUnjournalled.set(entry.id, started.id)
        throw new CogentaError({
          code: 'AUDIT_WRITE_FAILED',
          message: 'The action was undone, but the audit log could not record the outcome.',
          hint:
            'Do not undo it again: it is done. The intent was journalled (entry ' +
            started.id +
            '). Check the database and the disk space of the site.',
          details: { id: entry.id, startedAuditId: started.id },
        })
      }
      return jsonResponse(200, {
        data: { id: entry.id, tool, state: 'reverted', revertAuditId: recorded.id },
      })
    } finally {
      inFlight.delete(id)
    }
  }

  return {
    async handle(request, actor) {
      try {
        const segments = request.path
          .split('?')[0]
          ?.replace(/\/+$/u, '')
          .slice(BASE.length)
          .split('/')
          .filter((segment) => segment.length > 0)
        if (
          !request.path.startsWith(`${BASE}/`) ||
          segments === undefined ||
          segments.length < 1 ||
          segments.length > 2
        ) {
          throw routeNotFound()
        }
        const administrator = requireAdminSession(actor)
        const id = decodeURIComponent(segments[0] ?? '')
        const method = request.method.toUpperCase()
        const adminActor: Actor = { id: administrator, roles: actor.roles }

        if (segments.length === 1) {
          if (method !== 'GET') return methodNotAllowed('GET')
          const entry = await entryOrThrow(id)
          const { tool, state } = await inspect(entry, sourceFor(adminActor))
          return jsonResponse(200, { data: { id: entry.id, tool, ...state } })
        }
        if (segments[1] !== 'revert') throw routeNotFound()
        if (method !== 'POST') return methodNotAllowed('POST')
        return await revert(id, adminActor)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
