import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/mcp/actions` — hand-mirrored from
 * `packages/cli/src/commands/mcp-undo.ts`, the same reason every other
 * `*-client.ts` here copies its server-side shape by hand.
 *
 * An autonomous API key runs reversible writes without approval; the audit
 * log is where an administrator takes one back (L42).
 */

/** Why an entry cannot be undone. */
export type McpUndoUnavailable = 'not-mcp' | 'failed' | 'no-receipt' | 'not-reversible'

export type McpActionState =
  | { readonly state: 'available' }
  | {
      readonly state: 'reverted'
      readonly revertedAt: string
      readonly revertAuditId: string
      readonly revertedBy: string | null
    }
  | { readonly state: 'unavailable'; readonly reason: McpUndoUnavailable }

export type McpAction = McpActionState & {
  readonly id: string
  readonly tool: string | null
}

export interface McpRevertResult {
  readonly id: string
  readonly tool: string
  readonly state: 'reverted'
  readonly revertAuditId: string | null
}

/** Whether an undo is on offer for this audit entry, already done, or impossible. */
export function getMcpAction(token: string, auditId: string): Promise<McpAction> {
  return request(`/api/mcp/actions/${encodeURIComponent(auditId)}`, {
    headers: authHeader(token),
  })
}

/** Undoes what the entry's tool call did. Refused with `TOOL_REVERT_REFUSED` when it was edited since. */
export function revertMcpAction(token: string, auditId: string): Promise<McpRevertResult> {
  return request(`/api/mcp/actions/${encodeURIComponent(auditId)}/revert`, {
    method: 'POST',
    headers: authHeader(token),
  })
}
